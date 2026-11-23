import {
  INTEGRATION_CATALOG,
  type IntegrationCatalogEntry,
} from "@openhands/extensions/integrations";
import { MOBILEBOX_INTEGRATION } from "./mobilebox";

export type { IntegrationCatalogEntry };

/**
 * The MCP marketplace this build offers: the published integration catalog
 * plus host integrations FreeHands ships itself. One merged list keeps the
 * marketplace page, the install modal and automation prerequisites agreeing
 * on which servers exist.
 */
export const MCP_MARKETPLACE: IntegrationCatalogEntry[] = [
  ...INTEGRATION_CATALOG,
  MOBILEBOX_INTEGRATION,
];
