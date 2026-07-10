const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const { openDb, genToken, getSettings, setSettings } = require('./db');
const { computeStops } = require('./stops');
const { simulateDay } = require('./simulate');

const SESSION_COOKIE = 'dt_session';

// All dates are handled as UTC 'YYYY-MM-DD' strings for simplicity — a single
// install serves one team in one operating region, so a fixed reference
// timezone avoids DST/travel edge cases without adding a timezone dependency.
function dateStringFor(atMs) {
  return new Date(atMs).toISOString().slice(0, 10);
}

function createApp({ dbPath, adminPassword, autologinToken = null, allowSimulate = false } = {}) {
  const db = openDb(dbPath);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(cookieParser());
  app.use(express.json({ limit: '256kb' }));

  app.locals.db = db;

  // ── helpers ────────────────────────────────────────────────────────────────
  const findRepById = db.prepare('SELECT * FROM reps WHERE id = ?');
  const findRepByKey = db.prepare('SELECT * FROM reps WHERE device_key = ?');

  function requireAuth(req, res, next) {
    const token = req.cookies[SESSION_COOKIE];
    if (token && db.prepare('SELECT id FROM sessions WHERE token = ?').get(token)) return next();
    res.status(401).json({ error: 'unauthorized' });
  }

  function createSession(res) {
    const token = crypto.randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions (token, created_at) VALUES (?, ?)').run(token, Date.now());
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax' });
  }

  function thresholds() {
    const s = getSettings(db);
    return {
      radiusM: Number(s.radius_m) || 40,
      drivebyS: Number(s.driveby_s) || 30,
      extendedS: Number(s.extended_s) || 300
    };
  }

  // Recompute-on-read: always derive stops fresh from the day's pings, so a
  // freshly-arrived ping is reflected the instant the route is next viewed —
  // no separate scheduler or cache-invalidation logic needed for Phase 1.
  function getRouteForRepDate(repId, date) {
    const pings = db
      .prepare('SELECT id, lat, lng, accuracy, battery, at FROM pings WHERE rep_id = ? AND date = ? ORDER BY at ASC')
      .all(repId, date);
    const stops = computeStops(pings, thresholds());

    db.prepare('DELETE FROM stops WHERE rep_id = ? AND date = ?').run(repId, date);
    const insertStop = db.prepare(`
      INSERT INTO stops (rep_id, date, seq, lat, lng, arrived_at, left_at, duration_s, ping_count, band)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const tx = db.transaction((rows) => {
      rows.forEach((s, idx) => {
        insertStop.run(repId, date, idx + 1, s.lat, s.lng, s.arrived_at, s.left_at, s.duration_s, s.ping_count, s.band);
      });
    });
    tx(stops);

    const storedStops = db
      .prepare('SELECT * FROM stops WHERE rep_id = ? AND date = ? ORDER BY seq ASC')
      .all(repId, date);
    return { pings, stops: storedStops };
  }

  function summaryFor(repId, date) {
    const { pings, stops } = getRouteForRepDate(repId, date);
    const total_time_s = pings.length >= 2 ? Math.round((pings[pings.length - 1].at - pings[0].at) / 1000) : 0;
    const avg_dwell_s = stops.length ? Math.round(stops.reduce((s, x) => s + x.duration_s, 0) / stops.length) : 0;
    return {
      date,
      ping_count: pings.length,
      stop_count: stops.length,
      knock_count: stops.filter((s) => s.band === 'knock').length,
      extended_count: stops.filter((s) => s.band === 'extended').length,
      driveby_count: stops.filter((s) => s.band === 'driveby').length,
      total_time_s,
      avg_dwell_s,
      first_ping_at: pings[0]?.at ?? null,
      last_ping_at: pings[pings.length - 1]?.at ?? null
    };
  }

  // ── auth ───────────────────────────────────────────────────────────────────
  app.get('/api/health', (req, res) => res.json({ ok: true, app: 'door-tracker' }));

  app.post('/api/login', (req, res) => {
    if ((req.body || {}).password !== adminPassword) return res.status(401).json({ error: 'wrong password' });
    createSession(res);
    res.json({ ok: true });
  });

  app.post('/api/logout', (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  });

  // Desktop mode auto-login (Electron passes a one-shot token).
  app.get('/auth/auto', (req, res) => {
    if (autologinToken && req.query.token === autologinToken) createSession(res);
    res.redirect('/');
  });

  app.get('/api/me', requireAuth, (req, res) => res.json({ ok: true }));

  // The mobile app runs from its own packaged origin (https://localhost inside
  // the Capacitor WebView), never the browser session the admin dashboard uses —
  // so its two unauthenticated, device_key-scoped endpoints need CORS headers to
  // be callable cross-origin. Scoped to just these two public routes; the
  // session-authenticated /api/* admin routes are deliberately left without CORS
  // (opening those to arbitrary origins would be a real CSRF-adjacent risk).
  function allowMobileCors(req, res, next) {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  }
  app.options('/api/ping', allowMobileCors);
  app.options('/api/verify-key', allowMobileCors);

  // ── ping ingestion (public — keyed by a rep's device_key, no admin session) ─
  // This is the endpoint the Phase 2 mobile app will POST to every 5 minutes.
  app.post('/api/ping', allowMobileCors, (req, res) => {
    const body = req.body || {};
    const rep = findRepByKey.get(String(body.device_key || ''));
    if (!rep) return res.status(404).json({ error: 'unknown device_key' });
    if (!rep.active) return res.status(403).json({ error: 'rep is inactive' });

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'lat/lng required' });
    }
    const at = Number.isFinite(Number(body.at)) ? Math.round(Number(body.at)) : Date.now();
    const accuracy = Number.isFinite(Number(body.accuracy)) ? Number(body.accuracy) : null;
    const battery = Number.isFinite(Number(body.battery)) ? Number(body.battery) : null;

    db.prepare('INSERT INTO pings (rep_id, lat, lng, accuracy, battery, at, date) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(rep.id, lat, lng, accuracy, battery, at, dateStringFor(at));

    res.status(201).json({ ok: true });
  });

  // Lets the mobile app confirm a device_key is valid during setup without
  // writing a throwaway ping row (which would otherwise pollute the rep's
  // real route with a stray point wherever the phone happened to be at setup time).
  app.get('/api/verify-key', allowMobileCors, (req, res) => {
    const rep = findRepByKey.get(String(req.query.device_key || ''));
    if (!rep || !rep.active) return res.status(404).json({ ok: false });
    res.json({ ok: true, name: rep.name });
  });

  // ── demo/dev: simulate a fake day of pings so the dashboard has data ───────
  app.post('/api/simulate', requireAuth, (req, res) => {
    if (!allowSimulate) return res.status(403).json({ error: 'simulate is disabled on this install' });
    const rep = findRepById.get(req.body?.rep_id);
    if (!rep) return res.status(404).json({ error: 'rep not found' });

    const date = String(req.body?.date || dateStringFor(Date.now()));
    const startAt = new Date(`${date}T09:00:00.000Z`).getTime();
    const pings = simulateDay({ startAt });

    const insertPing = db.prepare(
      'INSERT INTO pings (rep_id, lat, lng, accuracy, battery, at, date) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const tx = db.transaction((rows) => {
      for (const p of rows) insertPing.run(rep.id, p.lat, p.lng, p.accuracy, p.battery, p.at, dateStringFor(p.at));
    });
    tx(pings);

    res.status(201).json({ ok: true, count: pings.length, date });
  });

  // ── reps CRUD ────────────────────────────────────────────────────────────
  app.get('/api/reps', requireAuth, (req, res) => {
    const reps = db.prepare('SELECT * FROM reps ORDER BY created_at DESC').all();
    const date = req.query.date ? String(req.query.date) : null;
    res.json(reps.map((r) => (date ? { ...r, summary: summaryFor(r.id, date) } : r)));
  });

  app.post('/api/reps', requireAuth, (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    const device_key = genToken();
    const info = db
      .prepare('INSERT INTO reps (name, device_key, active, created_at) VALUES (?, ?, 1, ?)')
      .run(name, device_key, Date.now());
    res.status(201).json(findRepById.get(info.lastInsertRowid));
  });

  app.put('/api/reps/:id', requireAuth, (req, res) => {
    const rep = findRepById.get(req.params.id);
    if (!rep) return res.status(404).json({ error: 'not found' });
    const name = req.body?.name != null ? String(req.body.name).trim() : rep.name;
    const active = req.body?.active != null ? (req.body.active ? 1 : 0) : rep.active;
    db.prepare('UPDATE reps SET name = ?, active = ? WHERE id = ?').run(name, active, rep.id);
    res.json(findRepById.get(rep.id));
  });

  app.delete('/api/reps/:id', requireAuth, (req, res) => {
    const rep = findRepById.get(req.params.id);
    if (!rep) return res.status(404).json({ error: 'not found' });
    db.prepare('DELETE FROM pings WHERE rep_id = ?').run(rep.id);
    db.prepare('DELETE FROM stops WHERE rep_id = ?').run(rep.id);
    db.prepare('DELETE FROM reps WHERE id = ?').run(rep.id);
    res.json({ ok: true });
  });

  // ── route + summary ─────────────────────────────────────────────────────
  app.get('/api/reps/:id/route', requireAuth, (req, res) => {
    const rep = findRepById.get(req.params.id);
    if (!rep) return res.status(404).json({ error: 'not found' });
    const date = String(req.query.date || dateStringFor(Date.now()));
    res.json({ rep, ...getRouteForRepDate(rep.id, date) });
  });

  app.get('/api/reps/:id/summary', requireAuth, (req, res) => {
    const rep = findRepById.get(req.params.id);
    if (!rep) return res.status(404).json({ error: 'not found' });
    const date = String(req.query.date || dateStringFor(Date.now()));
    res.json({ rep, ...summaryFor(rep.id, date) });
  });

  // ── CSV export (payroll / compliance) ───────────────────────────────────
  app.get('/api/export.csv', requireAuth, (req, res) => {
    const repId = req.query.rep_id ? Number(req.query.rep_id) : null;
    const dateFrom = String(req.query.date_from || dateStringFor(Date.now()));
    const dateTo = String(req.query.date_to || dateFrom);

    const reps = repId ? [findRepById.get(repId)].filter(Boolean) : db.prepare('SELECT * FROM reps').all();
    const rows = [['rep_name', 'date', 'stop_seq', 'arrived_at', 'left_at', 'duration_s', 'band', 'lat', 'lng']];

    const dates = [];
    for (let d = new Date(`${dateFrom}T00:00:00.000Z`); d <= new Date(`${dateTo}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    for (const rep of reps) {
      for (const date of dates) {
        const { stops } = getRouteForRepDate(rep.id, date);
        for (const s of stops) {
          rows.push([
            rep.name,
            date,
            s.seq,
            new Date(s.arrived_at).toISOString(),
            new Date(s.left_at).toISOString(),
            s.duration_s,
            s.band,
            s.lat.toFixed(6),
            s.lng.toFixed(6)
          ]);
        }
      }
    }

    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', `attachment; filename="door-tracker-${dateFrom}_${dateTo}.csv"`);
    res.send(csv);
  });

  // ── settings ───────────────────────────────────────────────────────────────
  app.get('/api/settings', requireAuth, (req, res) => res.json(getSettings(db)));

  app.put('/api/settings', requireAuth, (req, res) => {
    setSettings(db, req.body || {});
    res.json(getSettings(db));
  });

  // ── static frontend ────────────────────────────────────────────────────────
  const dist = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/auth')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  return app;
}

module.exports = { createApp };
