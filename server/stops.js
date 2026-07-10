// Stop-clustering: turns a rep's raw GPS pings into "stops" — places they
// stayed put long enough to plausibly be knocking doors / handing out flyers,
// vs. just driving past. This is the core logic of the product.
//
// Algorithm: walk pings in chronological order. A cluster grows for as long
// as each new ping stays within `radiusM` of the running centroid of the
// current cluster. A cluster of 2+ pings becomes a "stop"; a lone ping that
// never gets joined by a nearby follow-up is just transit, not a stop.

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function centroid(pings) {
  const lat = pings.reduce((s, p) => s + p.lat, 0) / pings.length;
  const lng = pings.reduce((s, p) => s + p.lng, 0) / pings.length;
  return { lat, lng };
}

function bandFor(durationS, thresholds) {
  if (durationS < thresholds.drivebyS) return 'driveby';
  if (durationS > thresholds.extendedS) return 'extended';
  return 'knock';
}

/**
 * @param {Array<{lat:number,lng:number,at:number}>} pings sorted ascending by `at` (epoch ms)
 * @param {{radiusM?:number, drivebyS?:number, extendedS?:number}} opts
 * @returns {Array<{lat,lng,arrived_at,left_at,duration_s,ping_count,band}>}
 */
function computeStops(pings, opts = {}) {
  const radiusM = opts.radiusM ?? 40;
  const drivebyS = opts.drivebyS ?? 30;
  const extendedS = opts.extendedS ?? 300;
  const thresholds = { drivebyS, extendedS };

  const stops = [];
  let i = 0;
  while (i < pings.length) {
    const cluster = [pings[i]];
    let j = i + 1;
    while (j < pings.length) {
      const c = centroid(cluster);
      const d = haversineMeters(c.lat, c.lng, pings[j].lat, pings[j].lng);
      if (d <= radiusM) {
        cluster.push(pings[j]);
        j++;
      } else {
        break;
      }
    }
    if (cluster.length >= 2) {
      const c = centroid(cluster);
      const arrived_at = cluster[0].at;
      const left_at = cluster[cluster.length - 1].at;
      const duration_s = Math.round((left_at - arrived_at) / 1000);
      stops.push({
        lat: c.lat,
        lng: c.lng,
        arrived_at,
        left_at,
        duration_s,
        ping_count: cluster.length,
        band: bandFor(duration_s, thresholds)
      });
      i = j;
    } else {
      i++; // lone ping, in transit — not a stop
    }
  }
  return stops;
}

module.exports = { haversineMeters, computeStops };
