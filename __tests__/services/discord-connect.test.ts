import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CONNECT_DISCORD_ACTION_KIND,
  DISCORD_BOT_TOKEN_SECRET_NAME,
  DISCORD_CONNECT_RESULT_PREFIX,
} from "#/constants/discord";
import {
  completeDiscordConnect,
  handleConnectDiscordAction,
} from "#/services/discord-connect";
import { SecretsService } from "#/api/secrets-service";
import { useGoalStore } from "#/stores/goal-store";
import {
  type DiscordConnectRequest,
  useDiscordConnectStore,
} from "#/stores/discord-connect-store";
import type { ConnectDiscordAction } from "#/types/agent-server/core";

const { mockSendMessage } = vi.hoisted(() => ({
  mockSendMessage: vi.fn(),
}));

vi.mock(
  "#/api/conversation-service/agent-server-conversation-service.api",
  () => ({ default: { sendMessage: mockSendMessage } }),
);

const createSecretSpy = vi
  .spyOn(SecretsService, "createSecret")
  .mockResolvedValue(undefined);

const CONVERSATION_ID = "conversation-1";

const action: ConnectDiscordAction = {
  kind: CONNECT_DISCORD_ACTION_KIND,
  guild_id: "123456789",
};

const request: DiscordConnectRequest = {
  conversationId: CONVERSATION_ID,
  toolCallId: "tool-call-1",
  guildId: "123456789",
};

/** The text the service posted back into the conversation. */
function reportedText(): string {
  const [conversationId, message] = mockSendMessage.mock.calls.at(-1) as [
    string,
    { content: { text: string }[] },
  ];
  expect(conversationId).toBe(CONVERSATION_ID);
  return message.content[0].text;
}

function reportedResult() {
  const text = reportedText();
  expect(text.startsWith(DISCORD_CONNECT_RESULT_PREFIX)).toBe(true);
  return JSON.parse(text.slice(DISCORD_CONNECT_RESULT_PREFIX.length));
}

beforeEach(() => {
  window.localStorage.clear();
  useGoalStore.setState({ statusByConversation: {} });
  useDiscordConnectStore.setState({ requests: [] });
  vi.clearAllMocks();
  mockSendMessage.mockResolvedValue(undefined);
});

describe("handleConnectDiscordAction", () => {
  it("queues one modal per tool call, ignoring replays", async () => {
    await handleConnectDiscordAction(action, CONVERSATION_ID, "tool-call-1");
    await handleConnectDiscordAction(action, CONVERSATION_ID, "tool-call-1");

    expect(useDiscordConnectStore.getState().requests).toHaveLength(1);
    expect(useDiscordConnectStore.getState().requests[0].guildId).toBe(
      "123456789",
    );
  });

  it("accepts a call with no guild id", async () => {
    await handleConnectDiscordAction(
      { kind: CONNECT_DISCORD_ACTION_KIND },
      CONVERSATION_ID,
      "tool-call-2",
    );

    expect(useDiscordConnectStore.getState().requests[0].guildId).toBeNull();
  });

  it("does not post anything until the user answers", async () => {
    await handleConnectDiscordAction(action, CONVERSATION_ID, "tool-call-3");
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

describe("completeDiscordConnect", () => {
  beforeEach(() => {
    useDiscordConnectStore.setState({ requests: [request] });
  });

  it("reports the guild id when the user connected the bot", async () => {
    await completeDiscordConnect(request, { connected: true, guildId: "42" });

    const result = reportedResult();
    expect(result.status).toBe("connected");
    expect(result.guild_id).toBe("42");
    // The guidance tells the agent to read the token from its own secrets and
    // never echoes a value.
    expect(result.guidance).toContain("DISCORD_BOT_TOKEN");
    expect(useDiscordConnectStore.getState().requests).toHaveLength(0);
  });

  it("omits the guild id when the user connected without naming one", async () => {
    await completeDiscordConnect(request, { connected: true, guildId: null });

    const result = reportedResult();
    expect(result.status).toBe("connected");
    expect(result.guild_id).toBeNull();
  });

  it("reports a dismissal with guidance, never a guild id", async () => {
    await completeDiscordConnect(request, { connected: false });

    expect(reportedResult()).toEqual({
      status: "not_connected",
      guidance: expect.any(String),
    });
  });

  it("reports each request once", async () => {
    await completeDiscordConnect(request, { connected: true, guildId: "42" });
    await completeDiscordConnect(request, { connected: true, guildId: "42" });

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  it("saves a pasted bot token as the DISCORD_BOT_TOKEN secret", async () => {
    await completeDiscordConnect(request, {
      connected: true,
      guildId: "42",
      botToken: "secret-token-value",
    });

    expect(createSecretSpy).toHaveBeenCalledWith(
      DISCORD_BOT_TOKEN_SECRET_NAME,
      "secret-token-value",
      "Discord bot token",
    );
    // The token never reaches the chat; only a mention of the secret name.
    expect(reportedText()).not.toContain("secret-token-value");
    expect(createSecretSpy.mock.lastCall?.[1]).toBe("secret-token-value");
  });

  it("keeps the original guidance when no token is pasted", async () => {
    await completeDiscordConnect(request, { connected: true, guildId: "42" });

    const result = reportedResult();
    expect(result.guidance).toContain("DISCORD_BOT_TOKEN");
    expect(createSecretSpy).not.toHaveBeenCalled();
  });

  it("stays quiet while a goal loop is active", async () => {
    useGoalStore.setState({
      statusByConversation: { [CONVERSATION_ID]: { active: true } } as never,
    });

    await completeDiscordConnect(request, { connected: true, guildId: "42" });

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(useDiscordConnectStore.getState().requests).toHaveLength(0);
  });
});
