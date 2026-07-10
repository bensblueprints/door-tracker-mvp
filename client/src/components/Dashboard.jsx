import React from 'react';
import { motion } from 'framer-motion';
import { User, MapPin, Clock, Footprints } from 'lucide-react';
import { fmtDuration } from '../api.js';

export default function Dashboard({ reps, selectedId, onSelect, onNew }) {
  if (!reps.length) {
    return (
      <div className="text-center py-20 border border-dashed border-zinc-800 rounded-2xl">
        <User className="w-8 h-8 mx-auto text-zinc-600 mb-3" />
        <p className="text-zinc-400 mb-4">No reps yet.</p>
        <button
          onClick={onNew}
          className="text-sm bg-sky-500 hover:bg-sky-400 text-zinc-950 font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Add your first rep
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {reps.map((rep, i) => {
        const s = rep.summary || {};
        const active = rep.id === selectedId;
        return (
          <motion.button
            key={rep.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => onSelect(rep.id)}
            className={`text-left border rounded-2xl p-4 transition-colors ${
              active ? 'border-sky-500 bg-sky-500/5' : 'border-zinc-800 bg-zinc-900 hover:border-zinc-700'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold">{rep.name}</span>
              {!rep.active && <span className="text-xs text-zinc-500">inactive</span>}
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-zinc-400">
              <div className="flex flex-col items-start gap-0.5">
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Time in field</span>
                <span className="text-zinc-100 text-sm">{fmtDuration(s.total_time_s || 0)}</span>
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Stops</span>
                <span className="text-zinc-100 text-sm">{s.stop_count ?? 0}</span>
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <span className="flex items-center gap-1"><Footprints className="w-3 h-3" /> Avg dwell</span>
                <span className="text-zinc-100 text-sm">{fmtDuration(s.avg_dwell_s || 0)}</span>
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
