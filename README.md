# 📍 Door Tracker

## Demo



https://github.com/user-attachments/assets/b8502bc7-11f3-4245-9b4e-6de3ef2723be



**See the route, see the stops, see the times. Pay once.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Door Tracker is a location tracker built for door-to-door sales, canvassing, and flyering crews — the question it answers is "did my rep actually work the route today, or just drive around?" Reps' phones ping location every 5 minutes; Door Tracker's stop-clustering engine turns that raw ping stream into a **connected route line with numbered, timed stops**, so a manager can see exactly where a rep parked and walked doors, for how long, at a glance.

> Pay once. Own it forever. No per-rep-per-month tax.

![Door Tracker dashboard](docs/screenshot.png)

## Features

- 🗺 **Route + stop map** — a polyline through every ping of the day, plus numbered pins at each auto-detected stop, color-coded by how long the rep actually stayed
- ⏱ **Stop-clustering engine** — groups pings within a configurable radius (default 40m) into "stops," with duration bands: **drive-by** (<30s, red — probably no real visit), **likely knock** (30s–5min, green), **extended visit** (>5min, blue)
- 📊 **Team overview** — every rep's time-in-field, stop count, and average dwell time for the day, at a glance
- 📁 **CSV export** — stop-by-stop breakdown with arrival/departure times and durations, for payroll or compliance
- 🧪 **Demo mode** — "Simulate a day" generates a realistic fake route so you can see the whole thing working before wiring up a real phone (Phase 2)
- ⚙️ **Tunable thresholds** — radius and duration bands are configurable per install, not hardcoded — dense urban routes and spread-out suburban routes need different settings
- 🖥 **Dual mode** — run it as a desktop app, or deploy to a $5 VPS when you need it public
- 🔒 **100% local** — your data never leaves your box; no telemetry, no phoning home

## ⚠️ Consent & legal — read before deploying

This app tracks the real-time location of your employees during work hours. That's a legitimate, common business need for field sales/canvassing teams — **but it must be used transparently and with consent**:

- Only track reps who have knowingly agreed to location tracking during their shift, ideally in writing (see a sample consent clause below).
- Only use it on company-provided devices or with the rep's explicit consent on a personal device.
- Never deploy it covertly. The Phase 2 mobile app (see below) is designed to always show a visible "tracking active" indicator — don't build around that.
- Check your local/state employment-law requirements before deploying; consent requirements vary by jurisdiction.

**Sample consent clause** (adapt with your own counsel — not legal advice):
> "As part of my role, I understand and consent to my employer tracking my location via a company-provided or company-approved mobile app during scheduled work shifts, for the purpose of route verification and field operations. Location tracking is limited to shift hours and I will be notified when tracking is active."

## Quick start

```bash
npm i && npm run build && npm start
# → http://localhost:5374  (default password: admin — set ADMIN_PASSWORD!)
```

Add a rep from the dashboard, then click **"Simulate a day"** on their route map to see the stop-clustering engine in action with realistic fake data — no phone required yet.

### Desktop mode

```bash
npm i
npm run desktop
```

Same app, zero setup: the Express server boots on a free local port, data lives in your user profile, and you're auto-logged-in. `npm run dist` builds a Windows installer.

### Docker / VPS

```bash
cp .env.example .env   # set ADMIN_PASSWORD, BASE_URL
docker compose up -d
```

SQLite lives in a named volume; back up one file and you've backed up everything.

## Roadmap: Phase 1 vs Phase 2

**Phase 1:** the backend engine, stop-clustering algorithm, and manager web dashboard — fully functional and testable with the built-in day simulator. Shipped.

**Phase 2 (in progress):** the native Capacitor Android rep app, at `mobile/`. What's working today, verified end-to-end on a real emulator build (device key setup → GPS permission → live ping → shows up on the manager dashboard): sign in with a device key, foreground 5-minute location pings while the app is open, a persistent visible "Location sharing active" indicator, last-ping/status readout, and a catch-up ping the moment the app returns to the foreground after being backgrounded.

**Known Phase 2 limitation, stated plainly:** reliable 5-minute pings require the app to stay open in the foreground during a shift — Android throttles JS timers once the app is minimized, so tracking pauses (not silently, the UI says so) until the rep reopens it. A true always-on background service (persistent notification + Android foreground service) is a documented future enhancement, not yet built. Manual check-in and per-stop outcome tagging ("no answer" / "not interested" / "sale" / "callback") are also not built yet. iOS has not been built or tested (requires a Mac).

`POST /api/ping` (keyed by each rep's `device_key`, generated automatically when you add a rep) and `GET /api/verify-key` (used by the mobile app's setup screen to validate a key without writing a throwaway ping) are both live and CORS-enabled for the mobile app's own origin.

## Tech stack

Node 20+ · Express · better-sqlite3 · React 18 · Vite · Tailwind CSS 4 · Framer Motion · Lucide · Leaflet + react-leaflet (OpenStreetMap tiles, no API key) · Electron (desktop mode)

## Door Tracker vs. the monthly guys

| | **Door Tracker** | Badger Maps | SalesRabbit | Spotio |
|---|---|---|---|---|
| Price | **$49 once** | $58–119/user/mo | $25–45/user/mo | $39–99/user/mo |
| Cost over 3 years, 5-rep team | **$49** | $10,440–21,420 | $4,500–8,100 | $7,020–17,820 |
| Reps | Unlimited | Per-seat | Per-seat | Per-seat |
| Your data | On your box | Their cloud | Their cloud | Their cloud |
| Route + stop-dwell-time detection | ✅ | ✅ | ⚠️ limited | ✅ |
| CSV export | ✅ | ✅ | ✅ | ✅ |
| Desktop app | ✅ | ❌ | ❌ | ❌ |
| Self-hosted | ✅ one process | ❌ | ❌ | ❌ |

*Pays for itself instantly vs. any of the above — the per-seat monthly tax is what these tools are actually charging for.*

## ☕ Skip the setup — get the 1-click installer

Want the packaged Windows installer plus lifetime updates without touching a terminal? Grab the one-time bundle:

**→ [https://whop.com/benjisaiempire/doortracker](https://whop.com/benjisaiempire/doortracker)**

## API reference

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/ping` | `device_key` | record a location ping (what the Phase 2 mobile app will call every 5 min) |
| `POST /api/simulate` | session | generate a fake day of pings for a rep (demo/dev only, `ALLOW_SIMULATE`) |
| `POST /api/login` / `/api/logout` | — | session auth |
| `GET\|POST /api/reps`, `PUT\|DELETE /api/reps/:id` | session | manage reps (each gets a `device_key`) |
| `GET /api/reps/:id/route?date=` | session | ordered pings + computed stops for the route map |
| `GET /api/reps/:id/summary?date=` | session | aggregate time-in-field / stop counts for a day |
| `GET /api/export.csv?rep_id=&date_from=&date_to=` | session | CSV export of stops |
| `GET\|PUT /api/settings` | session | radius/duration thresholds |

## Development

```bash
npm start        # API on :5374
npm run dev      # Vite dev server on :5375 (proxies /api)
npm test         # smoke test: ping ingestion → stop-clustering → route/summary/CSV
```

## License

[MIT](LICENSE) © 2026 Ben (bensblueprints)

## macOS build

See [MAC-BUILD.md](MAC-BUILD.md). Quickest path: GitHub **Actions** tab -> run the **Mac Build** (`mac-build.yml`) workflow to get a downloadable `.dmg` (unsigned - right-click -> Open on first launch).
