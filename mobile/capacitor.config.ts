import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bensblueprints.doortracker.mobile',
  appName: 'Door Tracker',
  webDir: 'dist',
  android: {
    // Self-hosted Door Tracker servers won't always sit behind HTTPS (e.g. a
    // rep connecting over the local network, or a fresh install before a
    // reverse-proxy TLS cert is set up), so the WebView (served from an
    // https://localhost origin) must be allowed to call an http:// API server.
    // The AndroidManifest's network_security_config.xml still restricts which
    // *hosts* may be reached over cleartext for the local-dev case; production
    // deployments should still use HTTPS where possible.
    allowMixedContent: true
  }
};

export default config;
