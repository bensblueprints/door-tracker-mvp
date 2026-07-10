import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { MapPinned, Lock } from 'lucide-react';
import { api } from '../api.js';

export default function Login({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.login(password);
      onLogin();
    } catch {
      setError('Wrong password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={submit}
        className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-5"
      >
        <div className="flex items-center gap-2 justify-center text-lg font-semibold">
          <MapPinned className="w-6 h-6 text-sky-400" /> Door Tracker
        </div>
        <p className="text-sm text-zinc-500 text-center">
          See the route, see the stops, see the times. Pay once, own it forever.
        </p>
        <label className="block">
          <span className="text-xs text-zinc-400 uppercase tracking-wide">Admin password</span>
          <div className="mt-1.5 relative">
            <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-sky-500"
              placeholder="••••••••"
            />
          </div>
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          disabled={busy}
          className="w-full bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-zinc-950 font-medium rounded-lg py-2 transition-colors"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </motion.form>
    </div>
  );
}
