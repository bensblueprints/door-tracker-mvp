import React, { useEffect, useRef, useState } from 'react';
import { Geolocation } from '@capacitor/geolocation';
import { Device } from '@capacitor/device';
import { App as CapApp } from '@capacitor/app';
import { loadConfig, saveConfig, clearConfig, sendPing, testConnection, type Config } from './api';

const PING_INTERVAL_MS = 5 * 60 * 1000;

function fmtTime(ms: number | null): string {
  if (!ms) return 'never';
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function SetupScreen({ onSaved }: { onSaved: (config: Config) => void }) {
  const [serverUrl, setServerUrl] = useState('http://10.0.2.2:5374');
  const [deviceKey, setDeviceKey] = useState('');
  const [repName, setRepName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!serverUrl.trim() || !deviceKey.trim()) {
      setError('Server URL and device key are both required.');
      return;
    }
    setBusy(true);
    const config: Config = { serverUrl: serverUrl.trim(), deviceKey: deviceKey.trim(), repName: repName.trim() };
    try {
      const result = await testConnection(config);
      if (!result.ok) {
        setError(result.error || 'Could not verify device key.');
        return;
      }
      const finalConfig = { ...config, repName: result.repName || config.repName };
      await saveConfig(finalConfig);
      onSaved(finalConfig);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="brand">📍 Door Tracker</div>
      <div className="subtitle">Enter the details your manager gave you when they added you as a rep.</div>
      <form onSubmit={submit}>
        <div className="field">
          <label>Server URL</label>
          <input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://your-company.example.com"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>
        <div className="field">
          <label>Device key</label>
          <input
            value={deviceKey}
            onChange={(e) => setDeviceKey(e.target.value)}
            placeholder="paste the key from your manager"
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? 'Connecting…' : 'Connect'}
        </button>
      </form>
      <p className="footer-note">
        Your location is only shared while tracking is turned on inside this app, and this screen will always show
        you clearly when it's active. Ask your manager if you're unsure whether you've consented to being tracked.
      </p>
    </div>
  );
}

function TrackingScreen({ config, onLogout }: { config: Config; onLogout: () => void }) {
  const [tracking, setTracking] = useState(false);
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [pingCount, setPingCount] = useState(0);
  const [foreground, setForeground] = useState(true);
  const [permissionError, setPermissionError] = useState('');
  const intervalRef = useRef<number | null>(null);
  const trackingRef = useRef(false); // avoids stale closures inside the app-state listener

  const doPing = async () => {
    try {
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      const battery = await Device.getBatteryInfo().catch(() => null);
      const result = await sendPing(config, {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        battery: battery?.batteryLevel != null ? Math.round(battery.batteryLevel * 100) : null,
        at: Date.now()
      });
      setLastPingAt(Date.now());
      if (result.ok) {
        setLastError(null);
        setPingCount((c) => c + 1);
      } else {
        setLastError(result.error || 'ping failed');
      }
    } catch (e) {
      setLastPingAt(Date.now());
      setLastError(e instanceof Error ? e.message : 'location error');
    }
  };

  const startTracking = async () => {
    setPermissionError('');
    const perm = await Geolocation.requestPermissions();
    if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
      setPermissionError('Location permission was denied — enable it in your phone Settings to start tracking.');
      return;
    }
    trackingRef.current = true;
    setTracking(true);
    await doPing();
    intervalRef.current = window.setInterval(doPing, PING_INTERVAL_MS);
  };

  const stopTracking = () => {
    trackingRef.current = false;
    setTracking(false);
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => {
    const listener = CapApp.addListener('appStateChange', ({ isActive }) => {
      setForeground(isActive);
      // JS timers are throttled while the app is backgrounded on Android, so a
      // 5-minute setInterval will drift or stall while minimized. Firing a
      // catch-up ping the moment the rep returns keeps the gap visible and
      // bounded instead of silently missing pings — see README "Phase 2
      // limitations" for the honest scope of what this does and doesn't cover.
      if (isActive && trackingRef.current) doPing();
    });
    return () => {
      listener.then((l) => l.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <div className="screen">
      <div className="brand">📍 Door Tracker</div>
      <div className="subtitle">{config.repName || 'Signed in'}</div>

      <div className={`tracking-card ${tracking ? 'on' : 'off'}`}>
        {tracking ? (
          <>
            <div className="tracking-status">
              <span className="pulse-dot" /> Location sharing active
            </div>
            <div className="tracking-sub">Pinging every 5 minutes while this app is open</div>
          </>
        ) : (
          <>
            <div className="tracking-status" style={{ color: '#a1a1aa' }}>
              ⏸ Not tracking
            </div>
            <div className="tracking-sub">Tap Start Tracking when your shift begins</div>
          </>
        )}
      </div>

      {permissionError && <p className="error">{permissionError}</p>}
      {!foreground && tracking && (
        <p className="error" style={{ color: '#facc15' }}>
          App is in the background — pings pause until you reopen it.
        </p>
      )}

      <div className="info-row">
        <span className="label">Last ping</span>
        <span>{fmtTime(lastPingAt)}</span>
      </div>
      <div className="info-row">
        <span className="label">Pings sent this session</span>
        <span>{pingCount}</span>
      </div>
      <div className="info-row">
        <span className="label">Last status</span>
        <span style={{ color: lastError ? '#f87171' : '#4ade80' }}>{lastError || (lastPingAt ? 'OK' : '—')}</span>
      </div>

      <div className="spacer" />

      {tracking ? (
        <button className="btn btn-danger" onClick={stopTracking}>
          Stop Tracking
        </button>
      ) : (
        <button className="btn btn-primary" onClick={startTracking}>
          Start Tracking
        </button>
      )}
      <div style={{ height: 12 }} />
      <button className="btn btn-ghost" onClick={onLogout} disabled={tracking}>
        Change device
      </button>

      <p className="footer-note">
        Keep this app open in the foreground during your shift for reliable 5-minute updates. Locking the screen or
        switching apps pauses tracking until you return — this app does not track you covertly or in the background
        beyond what's shown above.
      </p>
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState<Config | null | undefined>(undefined);

  useEffect(() => {
    loadConfig().then((c) => setConfig(c));
  }, []);

  if (config === undefined) {
    return (
      <div className="screen">
        <div className="spacer" />
        <p style={{ textAlign: 'center', color: '#a1a1aa' }}>Loading…</p>
        <div className="spacer" />
      </div>
    );
  }

  if (!config) {
    return <SetupScreen onSaved={setConfig} />;
  }

  return (
    <TrackingScreen
      config={config}
      onLogout={async () => {
        await clearConfig();
        setConfig(null);
      }}
    />
  );
}
