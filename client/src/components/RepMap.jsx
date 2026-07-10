import React, { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';
import { motion } from 'framer-motion';
import { RefreshCw, Route as RouteIcon } from 'lucide-react';
import { api, fmtTime, fmtDuration, BAND_COLORS, BAND_LABELS } from '../api.js';

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 16);
      return;
    }
    map.fitBounds(points, { padding: [40, 40] });
  }, [points, map]);
  return null;
}

function stopIcon(seq, band) {
  const color = BAND_COLORS[band] || '#a1a1aa';
  return divIcon({
    className: '',
    html: `<div class="dt-stop-marker" style="background:${color}">${seq}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  });
}

export default function RepMap({ rep, date }) {
  const [data, setData] = useState(null); // { pings, stops }
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.route(rep.id, date);
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rep.id, date]);

  const path = useMemo(() => (data ? data.pings.map((p) => [p.lat, p.lng]) : []), [data]);
  const center = path[0] || [39.7392, -104.9903];

  const runSimulate = async () => {
    setSimulating(true);
    try {
      await api.simulate(rep.id, date);
      await load();
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <RouteIcon className="w-4 h-4" />
          {data ? `${data.pings.length} pings · ${data.stops.length} stops` : 'Loading…'}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runSimulate}
            disabled={simulating}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
            title="Generate a demo day of pings for this rep (Phase 1 — no phone wired up yet)"
          >
            {simulating ? 'Simulating…' : 'Simulate a day'}
          </button>
          <button
            onClick={load}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-[440px] rounded-2xl overflow-hidden border border-zinc-800"
      >
        <MapContainer center={center} zoom={15} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          {path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#38bdf8', weight: 3, opacity: 0.8 }} />}
          {path.length > 0 && <FitBounds points={path} />}
          {(data?.stops || []).map((s) => (
            <Marker key={s.id} position={[s.lat, s.lng]} icon={stopIcon(s.seq, s.band)}>
              <Popup>
                <div className="text-sm space-y-1">
                  <div className="font-semibold">Stop #{s.seq} — {BAND_LABELS[s.band]}</div>
                  <div>Arrived: {fmtTime(s.arrived_at)}</div>
                  <div>Left: {fmtTime(s.left_at)}</div>
                  <div>Duration: {fmtDuration(s.duration_s)}</div>
                  <div className="text-zinc-500">{s.ping_count} pings</div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </motion.div>

      {data && data.stops.length > 0 && (
        <div className="border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2">#</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Arrived</th>
                <th className="text-left px-4 py-2">Left</th>
                <th className="text-left px-4 py-2">Duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {data.stops.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-900/60">
                  <td className="px-4 py-2 text-zinc-500">{s.seq}</td>
                  <td className="px-4 py-2">
                    <span
                      className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${BAND_COLORS[s.band]}22`, color: BAND_COLORS[s.band] }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: BAND_COLORS[s.band] }} />
                      {BAND_LABELS[s.band]}
                    </span>
                  </td>
                  <td className="px-4 py-2">{fmtTime(s.arrived_at)}</td>
                  <td className="px-4 py-2">{fmtTime(s.left_at)}</td>
                  <td className="px-4 py-2 text-zinc-300">{fmtDuration(s.duration_s)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
