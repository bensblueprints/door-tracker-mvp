// Generates a plausible fake day of pings for a rep: a few "stop" clusters
// (tight jitter around a point, several pings a few minutes apart) connected
// by "drive" segments (widely-spaced points moving between stops). Used by
// the demo /api/simulate endpoint and the smoke test so the dashboard and
// stop-clustering engine can be verified before a real phone is wired up.

function jitterMeters(lat, lng, maxMeters) {
  // small random offset, meters -> degrees (approx, fine at this scale)
  const dLat = ((Math.random() - 0.5) * 2 * maxMeters) / 111320;
  const dLng =
    ((Math.random() - 0.5) * 2 * maxMeters) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lng: lng + dLng };
}

/**
 * @param {{baseLat?:number, baseLng?:number, startAt?:number}} opts startAt = epoch ms for the day's first ping
 * @returns {Array<{lat:number,lng:number,accuracy:number,battery:number,at:number}>}
 */
function simulateDay(opts = {}) {
  const baseLat = opts.baseLat ?? 39.7392;
  const baseLng = opts.baseLng ?? -104.9903;
  const startAt = opts.startAt ?? Date.now() - 8 * 3600 * 1000;

  // A handful of "block" stop locations, ~150-400m apart (a walkable route),
  // plus one longer lunch-style stop.
  const blocks = [
    { lat: baseLat, lng: baseLng, minutes: 14 },
    { lat: baseLat + 0.0015, lng: baseLng + 0.0008, minutes: 3 },
    { lat: baseLat + 0.0031, lng: baseLng + 0.0021, minutes: 22 }, // extended (lunch/long visit)
    { lat: baseLat + 0.0048, lng: baseLng + 0.0009, minutes: 8 },
    { lat: baseLat + 0.0060, lng: baseLng - 0.0006, minutes: 0.4 } // drive-by, no real visit
  ];

  const pings = [];
  let t = startAt;
  const pushPing = (lat, lng, atMs) => {
    const j = jitterMeters(lat, lng, 12); // stay within a tight radius
    pings.push({ lat: j.lat, lng: j.lng, accuracy: 8 + Math.random() * 6, battery: 90 - pings.length * 0.4, at: Math.round(atMs) });
  };

  blocks.forEach((block, idx) => {
    const spacingMs = Math.max(60_000, (block.minutes * 60_000) / 3);
    const numPings = Math.max(2, Math.round((block.minutes * 60_000) / spacingMs) + 1);
    for (let k = 0; k < numPings; k++) {
      pushPing(block.lat, block.lng, t);
      t += spacingMs;
    }
    // drive gap to the next block (a few widely-spaced transit pings, not clustered)
    const next = blocks[idx + 1];
    if (next) {
      const driveSteps = 3;
      for (let s = 1; s <= driveSteps; s++) {
        const frac = s / (driveSteps + 1);
        const lat = block.lat + (next.lat - block.lat) * frac;
        const lng = block.lng + (next.lng - block.lng) * frac;
        t += 90_000; // 1.5 min between drive pings
        pushPing(lat, lng, t);
      }
      t += 90_000;
    }
  });

  return pings;
}

module.exports = { simulateDay };
