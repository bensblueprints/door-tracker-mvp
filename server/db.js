const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function nativeBindingPath() {
  // Under Electron the Node-ABI binding won't load; use the vendored Electron prebuild.
  if (!process.versions.electron) return null;
  const p = path.join(__dirname, '..', 'vendor', 'better_sqlite3-electron.node');
  return fs.existsSync(p) ? p : null;
}

// 22-char URL-safe base62 token (nanoid-style, crypto-strong, no ESM dep).
const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function genToken(len = 22) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function openDb(dbPath) {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const nativeBinding = nativeBindingPath();
  const db = new Database(dbPath, nativeBinding ? { nativeBinding } : {});
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS reps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      device_key TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rep_id INTEGER NOT NULL,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      accuracy REAL,
      battery REAL,
      at INTEGER NOT NULL,                             -- epoch ms
      date TEXT NOT NULL                                -- 'YYYY-MM-DD' in server-local time, precomputed for fast lookup
    );
    CREATE TABLE IF NOT EXISTS stops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rep_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      seq INTEGER NOT NULL,                             -- order within the day, 1-based, for numbered map pins
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      arrived_at INTEGER NOT NULL,
      left_at INTEGER NOT NULL,
      duration_s INTEGER NOT NULL,
      ping_count INTEGER NOT NULL,
      band TEXT NOT NULL                                 -- 'driveby' | 'knock' | 'extended'
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pings_rep_date ON pings(rep_id, date, at);
    CREATE INDEX IF NOT EXISTS idx_stops_rep_date ON stops(rep_id, date, seq);
  `);

  return db;
}

const DEFAULT_SETTINGS = {
  radius_m: '40',        // pings within this radius of a cluster's centroid belong to the same stop
  driveby_s: '30',       // stops shorter than this are flagged "drive-by / no visit" (red)
  extended_s: '300',     // stops longer than this are flagged "extended visit" (blue); between = "likely door knock" (green)
  retention_days: '90'
};

function getSettings(db) {
  const out = { ...DEFAULT_SETTINGS };
  for (const r of db.prepare('SELECT key, value FROM settings').all()) {
    if (r.value !== '' && r.value != null) out[r.key] = r.value;
  }
  return out;
}

function setSettings(db, obj) {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction((entries) => {
    for (const [k, v] of entries) {
      if (k in DEFAULT_SETTINGS) stmt.run(k, String(v ?? ''));
    }
  });
  tx(Object.entries(obj));
}

module.exports = { openDb, genToken, getSettings, setSettings, DEFAULT_SETTINGS };
