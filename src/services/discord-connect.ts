import {
  CONNECT_DISCORD_TOOL_NAME,
  DISCORD_CONNECT_RESULT_PREFIX,
} from "#/constants/discord";
import {
  type DiscordConnectRequest,
  useDiscordConnectStore,
} from "#/stores/discord-connect-store";
import type { ConnectDiscordAction } from "#/types/agent-server/core";
import { claimClientToolCall } from "#/utils/claim-client-tool-call";
import { postClientToolResult } from "./client-tool-result";

const LEDGER_STORAGE_KEY_PREFIX = "openhands-discord-connects:";

/** What the modal hands back once the user has answered. */
export interface DiscordConnectOutcome {
  connected: boolean;
  guildId?: string | null;
}

type DiscordConnectResult =
  | { status: "connected"; guild_id: string | null; guidance: string }
  | { status: "not_connected"; guidance: string };

const CONNECTED_GUIDANCE =
  "The FreeHands bot is now in the server. You can use it over Discord's REST " +
  "API (Authorization: Bot $DISCORD_BOT_TOKEN) to create channels, roles and " +
  "messages. Reference the token as $DISCORD_BOT_TOKEN; never print it.";

const NOT_CONNECTED_GUIDANCE =
  "The user closed the connect menu without adding the bot. Ask them how they " +
  "want to proceed; do not retry on your own.";

/**
 * Execute a `connect_discord` tool call: queue the connect menu for the modal,
 * which reports the outcome through {@link completeDiscordConnect}.
 */
export async function handleConnectDiscordAction(
  action: ConnectDiscordAction,
  conversationId: string,
  toolCallId: string,
): Promise<void> {
  // A replayed call would open the menu again and report the outcome twice.
  if (
    !claimClientToolCall(
      `${LEDGER_STORAGE_KEY_PREFIX}${conversationId}`,
      toolCallId,
    )
  ) {
    return;
  }

  const request: DiscordConnectRequest = {
    conversationId,
    toolCallId,
    guildId: action.guild_id ?? null,
  };
  useDiscordConnectStore.getState().enqueue(request);
}

function resolveResult(outcome: DiscordConnectOutcome): DiscordConnectResult {
  if (!outcome.connected) {
    return { status: "not_connected", guidance: NOT_CONNECTED_GUIDANCE };
  }
  return {
    status: "connected",
    guild_id: outcome.guildId ?? null,
    guidance: CONNECTED_GUIDANCE,
  };
}

/**
 * Hand the outcome of a Discord connect request back to the agent. The bot
 * token is never part of it — the agent reads that from its own secrets.
 *
 * Never rejects: the user has already answered, so a failure to report is
 * logged rather than surfaced.
 */
export async function completeDiscordConnect(
  request: DiscordConnectRequest,
  outcome: DiscordConnectOutcome,
): Promise<void> {
  const store = useDiscordConnectStore.getState();
  if (!store.requests.some((r) => r.toolCallId === request.toolCallId)) return;
  store.dismiss(request.toolCallId);

  await postClientToolResult(
    request.conversationId,
    DISCORD_CONNECT_RESULT_PREFIX,
    resolveResult(outcome),
  ).catch((error) => {
    console.warn(
      `[${CONNECT_DISCORD_TOOL_NAME}] Failed to report the connect result:`,
      error,
    );
  });
}
