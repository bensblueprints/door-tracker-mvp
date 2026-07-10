require('dotenv').config();
const path = require('path');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 5374;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'door-tracker.db');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const ALLOW_SIMULATE = process.env.ALLOW_SIMULATE !== 'false';

const app = createApp({ dbPath: DB_PATH, adminPassword: ADMIN_PASSWORD, allowSimulate: ALLOW_SIMULATE });

app.listen(PORT, () => {
  console.log(`Door Tracker listening on http://localhost:${PORT}`);
  if (ADMIN_PASSWORD === 'admin') {
    console.log('⚠ Using default admin password — set ADMIN_PASSWORD in .env for production.');
  }
});
