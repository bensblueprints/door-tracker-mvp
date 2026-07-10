# Door Tracker — Launch strategy

## Target communities (rules-aware angle)
- **r/sales** — "how do you verify your door-to-door team actually worked the route" as a discussion starter, not a pitch; mention the tool if asked.
- **r/doortodoor** — canvassing-specific, high relevance; lead with the stop-detection problem, not the product.
- **r/smallbusiness** — subscription-fatigue angle resonates broadly here.
- **r/selfhosted** — the open-source/self-hosted framing, technical audience appreciates the architecture (stop-clustering algorithm, recompute-on-read).
- Political canvassing / field-org Slack and Discord communities — high-intent audience, but be careful about self-promotion rules; lead with genuinely useful route-verification discussion.

## Hacker News "Show HN" draft
**Title:** Show HN: Door Tracker — self-hosted GPS route tracker with stop-dwell detection for field teams

**Body:**
I built this for door-to-door sales/canvassing/flyering teams who need to verify reps actually worked their route, not just drove through it. The core piece is a stop-clustering algorithm: it groups GPS pings into "stops" based on a configurable radius, then bands each stop by duration (drive-by / likely knock / extended visit) so a manager can tell a 3-second pause at a stop sign from a 5-minute door conversation.

Self-hosted (Node + Express + better-sqlite3 + React), one-time price instead of the $25-120/rep/month that Badger Maps/SalesRabbit/Spotio charge. Includes a built-in day simulator so you can see the whole pipeline working without wiring up a real phone yet — the native mobile app (background GPS) is a planned Phase 2, and the ingest API it'll call is already built and documented.

Repo: [link]. Feedback very welcome, especially on the clustering thresholds — I picked 40m/30s/5min defaults but made them all configurable since dense urban routes and spread-out suburban ones need different tuning.

## Real pricing (for the pitch)
- Badger Maps: $58–119/user/month
- SalesRabbit: $25–45/user/month + setup fees
- Spotio: ~$39–99/user/month

**Cost math:** a 5-rep team on Badger Maps' mid-tier (~$79/user/mo) pays **$4,740/year, every year**. Door Tracker is **$49 once**. Pays for itself before the first invoice.

## AppSumo/PitchGround pitch paragraph
Door Tracker replaces per-rep-per-month field-tracking subscriptions with a one-time purchase. It's built for door-to-door sales, canvassing, and flyering teams who need proof reps worked their assigned route — not just a location dot, but an actual route line with numbered, timed stops that distinguish a real door-knock from a drive-by. Self-hosted, so the data never leaves the buyer's own server. At $49 one-time vs. $58-119/rep/month from incumbents, it pays for itself in under a week for any team of 2+.

## SEO keywords (10)
badger maps alternative, salesrabbit alternative, door to door sales tracker, canvassing app tracker, field rep gps tracker one time purchase, flyering route tracker, sales rep location tracking software, field team route verification, gps stop detection app, self hosted field sales tracker
