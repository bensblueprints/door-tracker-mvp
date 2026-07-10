async function req(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.body != null ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  me: () => req('/api/me'),
  login: (password) => req('/api/login', { method: 'POST', body: { password } }),
  logout: () => req('/api/logout', { method: 'POST' }),

  reps: (date) => req(`/api/reps${date ? `?date=${date}` : ''}`),
  createRep: (name) => req('/api/reps', { method: 'POST', body: { name } }),
  updateRep: (id, body) => req(`/api/reps/${id}`, { method: 'PUT', body }),
  deleteRep: (id) => req(`/api/reps/${id}`, { method: 'DELETE' }),

  route: (repId, date) => req(`/api/reps/${repId}/route?date=${date}`),
  summary: (repId, date) => req(`/api/reps/${repId}/summary?date=${date}`),
  simulate: (repId, date) => req('/api/simulate', { method: 'POST', body: { rep_id: repId, date } }),

  exportCsvUrl: (repId, dateFrom, dateTo) =>
    `/api/export.csv?rep_id=${repId}&date_from=${dateFrom}&date_to=${dateTo}`,

  settings: () => req('/api/settings'),
  saveSettings: (body) => req('/api/settings', { method: 'PUT', body })
};

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function fmtTime(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function fmtDuration(seconds) {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export const BAND_COLORS = {
  driveby: '#f87171', // red — <30s, likely no real visit
  knock: '#4ade80', // green — likely door knock
  extended: '#60a5fa' // blue — extended visit
};

export const BAND_LABELS = {
  driveby: 'Drive-by',
  knock: 'Likely knock',
  extended: 'Extended visit'
};
