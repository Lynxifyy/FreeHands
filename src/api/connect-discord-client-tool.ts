import {
  CONNECT_DISCORD_TOOL_NAME,
  DISCORD_BOT_TOKEN_SECRET_NAME,
  DISCORD_CONNECT_RESULT_PREFIX,
} from "#/constants/discord";
import type { ClientToolSpec } from "./canvas-ui-client-tool";

const CONNECT_DISCORD_DESCRIPTION = `Ask the user to connect the FreeHands Discord bot to a server, so you can build and manage that server over Discord's REST API.

Use this when the user wants you to set up, organise or automate a Discord
server ("build me a good Discord server", "add a welcome channel", "set up
roles"). You cannot act on a server until the bot is in it, so call this first;
the user approves the bot through Discord's own OAuth screen and can pick which
server to add it to.

What comes back: this tool is acknowledged immediately, before the user has
answered. End your turn after calling it and wait. The outcome arrives as a
follow-up message starting with "${DISCORD_CONNECT_RESULT_PREFIX.trim()}". When
it reports status "connected" it carries the guild_id to act on; use that id as
the guild for every follow-up REST call.

Authentication: the bot token is exposed to your environment as
$${DISCORD_BOT_TOKEN_SECRET_NAME}. Send it as \`Authorization: Bot
$${DISCORD_BOT_TOKEN_SECRET_NAME}\` against https://discord.com/api/v10. Never
print or echo the token. If the follow-up says the bot is not connected, ask the
user how they want to proceed instead of retrying on your own.`;

export const CONNECT_DISCORD_CLIENT_TOOL: ClientToolSpec = {
  name: CONNECT_DISCORD_TOOL_NAME,
  description: CONNECT_DISCORD_DESCRIPTION,
  parameters: {
    type: "object",
    additionalProperties: false,
    properties: {
      guild_id: {
        type: "string",
        description:
          "Optional Discord server id you already know, so the connect menu can pre-select it. Omit when the user has not named a server.",
      },
    },
    required: [],
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    // Each call asks the user to connect again.
    idempotentHint: false,
    openWorldHint: true,
  },
};
