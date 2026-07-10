# Door Tracker — Product Hunt listing

**Name:** Door Tracker

**Tagline (60 char):** See if your sales reps knocked doors or just drove by

**Short description (260 char):**
Door Tracker pings your field reps' location every 5 minutes and draws their day as a route line with numbered, timed stops — so you can see exactly where they parked and worked, and for how long. Pay once, no per-rep monthly fee.

**Full description:**
Door-to-door sales, canvassing, and flyering managers have one recurring problem: you can't see whether a rep actually worked the route or just drove through it. Door Tracker solves this with a stop-clustering engine — it groups a rep's GPS pings into "stops," bands them by how long they lasted (drive-by, likely knock, extended visit), and draws the whole day as a connected line on a map with numbered, clickable stops showing arrival/departure times.

Unlike Badger Maps, SalesRabbit, or Spotio — which charge $25–$119 per rep per month — Door Tracker is a one-time purchase. Self-host it on your own box (or run it as a desktop app), and there's no per-seat tax as your team grows.

Phase 1 (this release) ships the full backend engine and manager dashboard, testable end-to-end with a built-in day simulator. Phase 2 (coming) adds the native mobile app for reps.

**Maker's first comment:**
Hey! I built Door Tracker after realizing every field-sales tracking tool charges monthly per rep for what's fundamentally a GPS ping and a map. The actual hard part — figuring out whether a cluster of pings means someone stopped and worked a block vs. just idled at a light — is a clustering algorithm, not a subscription. So I built that part properly (configurable radius + duration bands) and shipped it as a flat one-time price. Self-hosted, your data, your box. Would love feedback from anyone running a door-to-door or canvassing team.

**Gallery shot list (5 shots):**
1. Full route map — polyline + numbered colored stop pins over a neighborhood.
2. Stop popup open — showing arrival/departure time and duration for a single stop.
3. Team overview dashboard — rep cards with time-in-field, stop count, avg dwell.
4. Stop list table below the map — sortable, color-coded by band.
5. CSV export sample — showing the payroll/compliance-ready output.
