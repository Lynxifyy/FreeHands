import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android shell for the static Agent Canvas build.
 *
 * The web bundle is the same one `npm run dev:static` serves; the app is a
 * thin WebView around it that talks to a *remote* agent-server the user
 * configures in Settings. `server.androidScheme: "https"` keeps the WebView
 * origin secure so `crypto.subtle`, service workers and the SPA router behave
 * as they do in a browser tab; `allowNavigation` covers the OAuth/LLM flows
 * that leave the app.
 */
const config: CapacitorConfig = {
  appId: "dev.openhands.agentcanvas",
  appName: "FreeHands",
  webDir: "build",
  android: {
    // Mixed content lets the WebView load an http:// agent-server (LAN /
    // localhost) from the https:// app origin; the manifest also sets
    // usesCleartextTraffic for the same reason.
    allowMixedContent: true,
  },
  server: {
    // A secure, stable origin (https://localhost) so crypto.subtle, storage
    // and the SPA router behave exactly as they do in a browser tab.
    androidScheme: "https",
  },
};

export default config;
