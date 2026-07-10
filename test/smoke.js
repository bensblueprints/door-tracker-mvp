// Door Tracker smoke test — boots the real server against a temp DB, creates
// a rep, feeds it a realistic day of pings (two clusters "stops" separated by
// a driving gap), and asserts the stop-clustering engine + route/summary/CSV
// endpoints all produce correct results. Also verifies recompute-on-read:
// ingesting more pings for a date already viewed changes the result on the
// next fetch (no stale cache).
// Kills ONLY the spawned server child (never broad-kills node processes).
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');

const ROOT = path.join(__dirname, '..');
const TEST_PORT = 5476;
const ADMIN_PASSWORD = 'smoke-test-password';
const DB_PATH = path.join(__dirname, 'smoke.db');
const BASE = `http://127.0.0.1:${TEST_PORT}`;

for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

let serverProc = null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitFor(fn, label, tries = 40, delay = 250) {
  for (let i = 0; i < tries; i++) {
    try {
      const v = await fn();
      if (v) return v;
    } catch { /* retry */ }
    await sleep(delay);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

let cookie = '';
async function api(pathname, options = {}) {
  const res = await fetch(BASE + pathname, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function pingIn(deviceKey, lat, lng, at) {
  const res = await fetch(`${BASE}/api/ping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_key: deviceKey, lat, lng, accuracy: 10, battery: 80, at })
  });
  return res.status;
}

function dateStringFor(atMs) {
  return new Date(atMs).toISOString().slice(0, 10);
}

async function main() {
  console.log('1. Booting Door Tracker on port', TEST_PORT, 'with temp DB');
  serverProc = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(TEST_PORT), ADMIN_PASSWORD, DB_PATH, ALLOW_SIMULATE: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProc.stdout.on('data', (d) => process.stdout.write(`   [server] ${d}`));
  serverProc.stderr.on('data', (d) => process.stderr.write(`   [server] ${d}`));

  await waitFor(async () => (await api('/api/health')).data.ok, 'server health');

  console.log('   Auth: wrong password → 401, unauthenticated /api/reps → 401, login → 200');
  const bad = await api('/api/login', { method: 'POST', body: { password: 'wrong' } });
  assert.strictEqual(bad.status, 401, 'wrong password must 401');
  cookie = '';
  const unauth = await api('/api/reps');
  assert.strictEqual(unauth.status, 401, 'admin API must require auth');
  const good = await api('/api/login', { method: 'POST', body: { password: ADMIN_PASSWORD } });
  assert.strictEqual(good.status, 200, 'login must succeed');

  console.log('2. Creating a rep');
  const created = await api('/api/reps', { method: 'POST', body: { name: 'Smoke Test Rep' } });
  assert.strictEqual(created.status, 201, 'rep create must 201');
  assert.ok(created.data.device_key && created.data.device_key.length >= 20, 'response must include a device_key');
  const repId = created.data.id;
  const deviceKey = created.data.device_key;

  console.log('3. Unknown device_key → 404');
  const badPing = await pingIn('not-a-real-key', 40, -75, Date.now());
  assert.strictEqual(badPing, 404, 'unknown device_key must 404');

  console.log('4. Feeding a simulated day: 12-min stop A, drive gap, 3-min stop B');
  const A = { lat: 40.0, lng: -75.0 };
  const B = { lat: 40.005, lng: -75.0 };
  const jitter = (i) => (i % 2 === 0 ? 0.00003 : -0.00003);
  const t0 = Date.now() - 20 * 60 * 1000; // 20 minutes ago, well within "today" UTC in almost all cases

  // Stop A: 6 pings over 12 minutes (144s apart), tight jitter around A.
  for (let i = 0; i < 6; i++) {
    const at = t0 + i * 144_000;
    const s = await pingIn(deviceKey, A.lat + jitter(i), A.lng + jitter(i), at);
    assert.strictEqual(s, 201, `stop-A ping ${i} must 201`);
  }
  // Drive gap: 3 widely-spaced pings between A and B (~139m apart, not clustered).
  const driveStart = t0 + 6 * 144_000; // t0 + 864000? wait: last A ping index5 = t0+5*144000=t0+720000
  const lastAAt = t0 + 5 * 144_000; // 720000
  for (let i = 1; i <= 3; i++) {
    const at = lastAAt + i * 90_000;
    const frac = i * 0.25;
    const lat = A.lat + (B.lat - A.lat) * frac;
    const s = await pingIn(deviceKey, lat, A.lng, at);
    assert.strictEqual(s, 201, `drive ping ${i} must 201`);
  }
  const lastDriveAt = lastAAt + 3 * 90_000; // 720000 + 270000 = 990000
  // Stop B: 4 pings over 3 minutes (60s apart), tight jitter around B.
  const stopBStart = lastDriveAt + 90_000; // 1,080,000
  for (let i = 0; i < 4; i++) {
    const at = stopBStart + i * 60_000;
    const s = await pingIn(deviceKey, B.lat + jitter(i), B.lng + jitter(i), at);
    assert.strictEqual(s, 201, `stop-B ping ${i} must 201`);
  }
  const lastBAt = stopBStart + 3 * 60_000; // 1,080,000 + 180,000 = 1,260,000

  const date = dateStringFor(t0);

  console.log('5. GET route: pings in order, exactly 2 stops, correct durations + bands');
  const route1 = await api(`/api/reps/${repId}/route?date=${date}`);
  assert.strictEqual(route1.status, 200, 'route must 200');
  assert.strictEqual(route1.data.pings.length, 13, 'must have 13 pings total (6 + 3 + 4)');
  for (let i = 1; i < route1.data.pings.length; i++) {
    assert.ok(route1.data.pings[i].at >= route1.data.pings[i - 1].at, 'pings must be chronologically ordered');
  }
  assert.strictEqual(route1.data.stops.length, 2, 'must detect exactly 2 stops (drive pings must not cluster)');

  const [stopA, stopB] = route1.data.stops;
  assert.strictEqual(stopA.seq, 1, 'stop A must be numbered 1');
  assert.strictEqual(stopA.ping_count, 6, 'stop A must have 6 pings');
  assert.strictEqual(stopA.duration_s, 720, 'stop A duration must be 720s (12 min)');
  assert.strictEqual(stopA.band, 'extended', 'a 12-minute stop must be banded "extended" (>5min)');

  assert.strictEqual(stopB.seq, 2, 'stop B must be numbered 2');
  assert.strictEqual(stopB.ping_count, 4, 'stop B must have 4 pings');
  assert.strictEqual(stopB.duration_s, 180, 'stop B duration must be 180s (3 min)');
  assert.strictEqual(stopB.band, 'knock', 'a 3-minute stop must be banded "knock" (30s-5min)');

  console.log('6. GET summary: aggregate numbers match the route');
  const summary = await api(`/api/reps/${repId}/summary?date=${date}`);
  assert.strictEqual(summary.status, 200, 'summary must 200');
  assert.strictEqual(summary.data.stop_count, 2, 'summary stop_count must be 2');
  assert.strictEqual(summary.data.ping_count, 13, 'summary ping_count must be 13');
  assert.strictEqual(summary.data.extended_count, 1, 'summary must count 1 extended stop');
  assert.strictEqual(summary.data.knock_count, 1, 'summary must count 1 knock stop');
  assert.strictEqual(
    summary.data.total_time_s,
    Math.round((lastBAt - t0) / 1000),
    'total_time_s must span first to last ping'
  );

  console.log('7. GET /api/reps?date= returns per-rep summary');
  const repsWithSummary = await api(`/api/reps?date=${date}`);
  const repRow = repsWithSummary.data.find((r) => r.id === repId);
  assert.ok(repRow, 'rep must be in the list');
  assert.strictEqual(repRow.summary.stop_count, 2, 'reps list summary.stop_count must be 2');

  console.log('9. CSV export (before extension) contains both stops with the right bands');
  const csvRes = await fetch(`${BASE}/api/export.csv?rep_id=${repId}&date_from=${date}&date_to=${date}`, {
    headers: { Cookie: cookie }
  });
  assert.strictEqual(csvRes.status, 200, 'CSV export must 200');
  assert.ok(csvRes.headers.get('content-type').includes('text/csv'), 'CSV content-type must be text/csv');
  const csvText = await csvRes.text();
  const csvLines = csvText.trim().split('\n');
  assert.strictEqual(csvLines.length, 3, 'CSV must have a header row + 2 stop rows');
  assert.ok(csvText.includes('extended'), 'CSV must contain the extended stop (stop A)');
  assert.ok(csvText.includes('knock'), 'CSV must contain the knock stop (stop B)');

  console.log('8. Recompute-on-read: extending stop B past 5 min flips its band on next fetch');
  for (let i = 4; i <= 6; i++) {
    const at = stopBStart + i * 60_000;
    const s = await pingIn(deviceKey, B.lat + jitter(i), B.lng + jitter(i), at);
    assert.strictEqual(s, 201, `stop-B extension ping ${i} must 201`);
  }
  const route2 = await api(`/api/reps/${repId}/route?date=${date}`);
  assert.strictEqual(route2.data.stops.length, 2, 'still exactly 2 stops after extension');
  const stopB2 = route2.data.stops[1];
  assert.strictEqual(stopB2.ping_count, 7, 'stop B must now have 7 pings');
  assert.strictEqual(stopB2.duration_s, 360, 'stop B duration must now be 360s (6 min)');
  assert.strictEqual(stopB2.band, 'extended', 'stop B must flip to "extended" once it crosses 5 min');

  console.log('9b. CSV export (after extension) now shows stop B as extended, not knock');
  const csvRes2 = await fetch(`${BASE}/api/export.csv?rep_id=${repId}&date_from=${date}&date_to=${date}`, {
    headers: { Cookie: cookie }
  });
  const csvText2 = await csvRes2.text();
  assert.ok(!csvText2.includes('knock'), 'CSV must no longer contain a knock stop after the extension');
  assert.strictEqual(
    (csvText2.match(/extended/g) || []).length,
    2,
    'CSV must show both stops as extended now'
  );

  console.log('10. /api/simulate (demo endpoint) generates a plausible day for a fresh rep');
  const rep2 = await api('/api/reps', { method: 'POST', body: { name: 'Demo Rep' } });
  const simDate = dateStringFor(Date.now());
  const sim = await api('/api/simulate', { method: 'POST', body: { rep_id: rep2.data.id, date: simDate } });
  assert.strictEqual(sim.status, 201, 'simulate must 201');
  assert.ok(sim.data.count > 0, 'simulate must generate pings');
  const simRoute = await api(`/api/reps/${rep2.data.id}/route?date=${simDate}`);
  assert.ok(simRoute.data.stops.length >= 3, 'simulated day must produce multiple stops');

  console.log('\n✅ All smoke tests passed');
}

async function cleanup(code) {
  // kill ONLY the child we spawned — never broad-kill node/electron
  if (serverProc && !serverProc.killed) serverProc.kill();
  await sleep(300); // let the child release the DB file handles
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* windows file lock — harmless */ }
  }
  process.exit(code);
}

main()
  .then(() => cleanup(0))
  .catch(async (err) => {
    console.error('\n❌ Smoke test failed:', err.message);
    await cleanup(1);
  });
