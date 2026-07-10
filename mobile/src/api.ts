import { Preferences } from '@capacitor/preferences';

export interface Config {
  serverUrl: string;
  deviceKey: string;
  repName: string;
}

const KEY = 'door-tracker-config';

export async function loadConfig(): Promise<Config | null> {
  const { value } = await Preferences.get({ key: KEY });
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(config) });
}

export async function clearConfig(): Promise<void> {
  await Preferences.remove({ key: KEY });
}

export interface PingPayload {
  lat: number;
  lng: number;
  accuracy: number;
  battery: number | null;
  at: number;
}

export async function sendPing(config: Config, payload: PingPayload): Promise<{ ok: boolean; error?: string }> {
  try {
    const base = config.serverUrl.replace(/\/$/, '');
    const res = await fetch(`${base}/api/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_key: config.deviceKey, ...payload })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}

// Quick reachability + device_key check used by the setup screen so a typo'd
// server URL or wrong device key is caught immediately, not after the first
// silent background failure. Uses /api/verify-key rather than a real ping so
// setup doesn't leave a throwaway point in the rep's actual route data.
export async function testConnection(config: Config): Promise<{ ok: boolean; error?: string; repName?: string }> {
  const base = config.serverUrl.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/api/verify-key?device_key=${encodeURIComponent(config.deviceKey)}`);
    if (!res.ok) return { ok: false, error: 'device key not recognized by that server' };
    const data = await res.json();
    return { ok: true, repName: data.name };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('testConnection failed:', e);
    return { ok: false, error: 'could not reach server URL' };
  }
}
