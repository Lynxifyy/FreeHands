import type { IntegrationCatalogEntry } from "@openhands/extensions/integrations";

/**
 * Mobilebox (https://mobilebox.dev) provides cloud Android phones and iOS
 * simulators over MCP, so Oli can launch an app, tap through it, and read a
 * screenshot of a real device. The hosted MCP endpoint authenticates with a
 * bearer API key; the key is saved as a secret, never in source.
 */
export const MOBILEBOX_SECRET_NAME = "MOBILESANDBOX_API_KEY";

export const MOBILEBOX_MCP_URL = "https://mobilebox.dev/mcp";

export const MOBILEBOX_INTEGRATION: IntegrationCatalogEntry = {
  id: "mobilebox",
  name: "Mobilebox",
  description:
    "Cloud Android phones and iPhone/iPad simulators you drive over MCP: " +
    "create a phone, install your app, tap and type, then read a screenshot " +
    "to verify the result.",
  categories: ["Testing"],
  appUrl: "https://mobilebox.dev",
  docsUrl: "https://mobilebox.dev/setup.md",
  notes:
    "Billed per minute. The free workspace credit covers a first device; " +
    "delete a phone when you are done to stop the meter.",
  iconBg: "#0EA5E9",
  iconColor: "#FFFFFF",
  keywords: [
    "android",
    "ios",
    "iphone",
    "ipad",
    "emulator",
    "simulator",
    "mobile",
    "phone",
    "testing",
    "screenshot",
  ],
  popularityRank: 87,
  installHint:
    "Paste a Mobilebox API key. Create one at https://mobilebox.dev/login; " +
    "it is stored as the MOBILESANDBOX_API_KEY secret.",
  connectionOptions: [
    {
      id: "api",
      provider: "mcp",
      transport: {
        kind: "shttp",
        url: MOBILEBOX_MCP_URL,
      },
      auth: {
        strategy: "bearer",
        credentialLabel: "Mobilebox API key",
        credentialPlaceholder: "mbx_...",
        credentialHelp:
          "Found under API keys at https://mobilebox.dev/login. It starts with mbx_.",
        credentialSecretName: MOBILEBOX_SECRET_NAME,
        saveCredentialAsSecretByDefault: true,
      },
    },
  ],
};
