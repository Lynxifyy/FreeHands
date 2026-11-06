import { describe, expect, it } from "vitest";

import {
  CONNECT_DISCORD_ACTION_KIND,
  CONNECT_DISCORD_TOOL_NAME,
  DISCORD_BOT_CLIENT_ID,
  DISCORD_BOT_PERMISSIONS,
  DISCORD_BOT_TOKEN_SECRET_NAME,
  DISCORD_CONNECT_RESULT_PREFIX,
  buildDiscordBotInviteUrl,
  discordBotPermissionsValue,
  discordAppDeepLink,
} from "#/constants/discord";

describe("discord constants", () => {
  it("names the tool and derives the SDK action kind", () => {
    expect(CONNECT_DISCORD_TOOL_NAME).toBe("connect_discord");
    expect(CONNECT_DISCORD_ACTION_KIND).toBe("ClientAction_connect_discord");
    expect(DISCORD_CONNECT_RESULT_PREFIX).toBe("[discord-connect] ");
  });

  it("reads the bot token from the documented secret name", () => {
    expect(DISCORD_BOT_TOKEN_SECRET_NAME).toBe("DISCORD_BOT_TOKEN");
  });

  it("ships a public application id (never the token)", () => {
    // The application id is the public first segment of the token; the secret
    // half must never appear in the source.
    expect(DISCORD_BOT_CLIENT_ID).toMatch(/^\d{17,20}$/);
  });

  it("lists distinct permission bits and sums them", () => {
    const bits = DISCORD_BOT_PERMISSIONS.map((p) => p.bit);
    expect(new Set(bits).size).toBe(bits.length);
    expect(bits.every((bit) => Number.isInteger(bit) && bit > 0)).toBe(true);

    const expected = bits.reduce((total, bit) => total + bit, 0);
    expect(discordBotPermissionsValue()).toBe(String(expected));
  });

  it("includes the community-management capabilities the flow promises", () => {
    const names = DISCORD_BOT_PERMISSIONS.map((p) => p.name);
    for (const required of [
      "ManageChannels",
      "ManageRoles",
      "ViewChannels",
      "SendMessages",
      "ManageMessages",
      "CreateInstantInvite",
      "ManageWebhooks",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("builds an OAuth2 bot invite with the bot + commands scopes", () => {
    const url = new URL(buildDiscordBotInviteUrl());
    expect(`${url.origin}${url.pathname}`).toBe(
      "https://discord.com/oauth2/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe(DISCORD_BOT_CLIENT_ID);
    expect(url.searchParams.get("scope")).toBe("bot applications.commands");
    expect(url.searchParams.get("permissions")).toBe(
      discordBotPermissionsValue(),
    );
  });

  it("pre-selects and locks a guild when one is given", () => {
    const url = new URL(buildDiscordBotInviteUrl({ guildId: "123456789" }));
    expect(url.searchParams.get("guild_id")).toBe("123456789");
    expect(url.searchParams.get("disable_guild_select")).toBe("true");
  });

  it("honours an explicit client id and permissions override", () => {
    const url = new URL(
      buildDiscordBotInviteUrl({ clientId: "999", permissions: "8" }),
    );
    expect(url.searchParams.get("client_id")).toBe("999");
    expect(url.searchParams.get("permissions")).toBe("8");
  });

  it("does not leak a guild parameter when none is given", () => {
    const url = new URL(buildDiscordBotInviteUrl());
    expect(url.searchParams.has("guild_id")).toBe(false);
    expect(url.searchParams.has("disable_guild_select")).toBe(false);
  });

  it("builds a Discord app deep link", () => {
    expect(discordAppDeepLink()).toBe("discord://");
    expect(discordAppDeepLink("channels/123/456")).toBe(
      "discord://-/channels/123/456",
    );
  });
});
