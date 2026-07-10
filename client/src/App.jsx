import React, { useEffect, useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { MapPinned, LogOut, Plus, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { api, todayStr } from './api.js';
import Login from './components/Login.jsx';
import Dashboard from './components/Dashboard.jsx';
import RepModal from './components/RepModal.jsx';
import RepMap from './components/RepMap.jsx';

function shiftDate(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export default function App() {
  const [authed, setAuthed] = useState(null); // null = checking
  const [reps, setReps] = useState([]);
  const [date, setDate] = useState(todayStr());
  const [selectedId, setSelectedId] = useState(null);
  const [modal, setModal] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const list = await api.reps(date);
      setReps(list);
      if (!selectedId && list.length) setSelectedId(list[0].id);
    } catch (e) {
      if (e.status === 401) setAuthed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  useEffect(() => {
    api.me().then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (authed) refresh();
  }, [authed, refresh]);

  if (authed === null) {
    return <div className="min-h-screen grid place-items-center text-zinc-500">Loading…</div>;
  }
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const selected = reps.find((r) => r.id === selectedId);

  const addRep = async (name) => {
    await api.createRep(name);
    setModal(false);
    refresh();
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <MapPinned className="w-5 h-5 text-sky-400" />
            Door Tracker
          </div>
          <span className="text-xs text-zinc-500 hidden sm:block">route, stops, times — for the whole day</span>
          <div className="flex-1" />

          <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-1">
            <button onClick={() => setDate((d) => shiftDate(d, -1))} className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              value={date}
              max={todayStr()}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-sm px-1 py-1 focus:outline-none"
            />
            <button
              onClick={() => setDate((d) => shiftDate(d, 1))}
              disabled={date >= todayStr()}
              className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {selected && (
            <a
              href={api.exportCsvUrl(selected.id, date, date)}
              className="flex items-center gap-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg transition-colors"
              title="Export this rep's stops for this date as CSV"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </a>
          )}

          <button
            onClick={() => setModal(true)}
            className="flex items-center gap-1.5 text-sm bg-sky-500 hover:bg-sky-400 text-zinc-950 font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" /> Rep
          </button>
          <button
            onClick={async () => { await api.logout(); setAuthed(false); }}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 transition-colors"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        <Dashboard reps={reps} selectedId={selectedId} onSelect={setSelectedId} onNew={() => setModal(true)} />
        {selected && <RepMap rep={selected} date={date} />}
      </main>

      <AnimatePresence>{modal && <RepModal onClose={() => setModal(false)} onSave={addRep} />}</AnimatePresence>
    </div>
  );
}
