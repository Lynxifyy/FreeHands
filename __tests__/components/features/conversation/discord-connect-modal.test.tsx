import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DiscordConnectModal } from "#/components/features/conversation/discord-connect-modal";
import { DISCORD_BOT_CLIENT_ID } from "#/constants/discord";
import {
  type DiscordConnectRequest,
  useDiscordConnectStore,
} from "#/stores/discord-connect-store";
import { renderWithProviders } from "../../../../test-utils";

const { mockCompleteDiscordConnect } = vi.hoisted(() => ({
  mockCompleteDiscordConnect: vi.fn(),
}));

vi.mock("#/services/discord-connect", () => ({
  completeDiscordConnect: mockCompleteDiscordConnect,
}));

// renderWithProviders navigates to this conversation by default.
const request: DiscordConnectRequest = {
  conversationId: "test-conversation-id",
  toolCallId: "tool-call-1",
  guildId: null,
};

const renderModal = async (requests: DiscordConnectRequest[] = [request]) => {
  useDiscordConnectStore.setState({ requests });
  renderWithProviders(<DiscordConnectModal />);
  if (requests.some((r) => r.conversationId === request.conversationId)) {
    await screen.findByTestId("discord-connect-modal");
  }
};

describe("DiscordConnectModal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockCompleteDiscordConnect
      .mockReset()
      .mockImplementation((r: DiscordConnectRequest) =>
        useDiscordConnectStore.getState().dismiss(r.toolCallId),
      );
  });

  it("ignores requests from other conversations", async () => {
    await renderModal([{ ...request, conversationId: "other-conversation" }]);

    expect(screen.queryByTestId("discord-connect-modal")).toBeNull();
  });

  it("opens the bot invite URL in a new tab", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    await renderModal();

    await user.click(screen.getByTestId("discord-connect-add-bot"));

    const [url, target] = openSpy.mock.calls.at(-1) as [string, string];
    expect(url).toContain("https://discord.com/oauth2/authorize");
    expect(url).toContain(`client_id=${DISCORD_BOT_CLIENT_ID}`);
    expect(target).toBe("_blank");
  });

  it("pre-selects a server when the agent already knows its id", async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
    await renderModal([{ ...request, guildId: "123456789012345678" }]);

    await user.click(screen.getByTestId("discord-connect-add-bot"));

    const [url] = openSpy.mock.calls.at(-1) as [string];
    expect(url).toContain("guild_id=123456789012345678");
    expect(url).toContain("disable_guild_select=true");
  });

  it("confirms the connection with the entered server id", async () => {
    const user = userEvent.setup();
    await renderModal();

    await user.type(
      screen.getByTestId("discord-guild-id-input"),
      "123456789012345678",
    );
    await user.click(screen.getByTestId("discord-connect-confirm"));

    expect(mockCompleteDiscordConnect).toHaveBeenCalledWith(request, {
      connected: true,
      guildId: "123456789012345678",
      botToken: undefined,
    });
  });

  it("confirms with the pasted bot token", async () => {
    const user = userEvent.setup();
    await renderModal();

    await user.type(
      screen.getByTestId("discord-guild-id-input"),
      "123456789012345678",
    );
    await user.type(
      screen.getByTestId("discord-bot-token-input"),
      "discord-bot-token",
    );
    await user.click(screen.getByTestId("discord-connect-confirm"));

    expect(mockCompleteDiscordConnect).toHaveBeenCalledWith(request, {
      connected: true,
      guildId: "123456789012345678",
      botToken: "discord-bot-token",
    });
  });

  it("disables confirm while the server id is malformed", async () => {
    const user = userEvent.setup();
    await renderModal();

    await user.type(screen.getByTestId("discord-guild-id-input"), "abc");

    expect(screen.getByTestId("discord-connect-confirm")).toBeDisabled();
  });

  it("reports a dismissal when the user cancels", async () => {
    const user = userEvent.setup();
    await renderModal();

    await user.click(screen.getByTestId("discord-connect-cancel"));

    expect(mockCompleteDiscordConnect).toHaveBeenCalledWith(request, {
      connected: false,
    });
  });
});
