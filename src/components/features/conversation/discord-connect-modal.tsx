import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ExternalLink, KeyRound, MessageCircle } from "lucide-react";

import { BrandButton } from "#/components/features/settings/brand-button";
import {
  BaseModalDescription,
  BaseModalTitle,
} from "#/components/shared/modals/confirmation-modals/base-modal";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import {
  buildDiscordBotInviteUrl,
  discordAppDeepLink,
} from "#/constants/discord";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import { I18nKey } from "#/i18n/declaration";
import { completeDiscordConnect } from "#/services/discord-connect";
import { useDiscordConnectStore } from "#/stores/discord-connect-store";

const GUILD_ID_PATTERN = /^\d{17,20}$/;

/**
 * Connect menu for the FreeHands Discord bot, shown over the conversation when
 * the agent calls `connect_discord`. The user adds the bot to a server through
 * Discord's own OAuth screen, then confirms here so the agent learns the
 * server id. The bot token never touches this component.
 */
export function DiscordConnectModal() {
  const { t } = useTranslation("openhands");
  const { conversationId } = useOptionalConversationId();
  const request = useDiscordConnectStore((s) =>
    s.requests.find((r) => r.conversationId === conversationId),
  );
  const [guildId, setGuildId] = useState(request?.guildId ?? "");
  const [botToken, setBotToken] = useState("");

  if (!request) return null;

  const title = t(I18nKey.DISCORD$CONNECT_TITLE);
  const trimmedGuildId = guildId.trim();
  const trimmedBotToken = botToken.trim();
  const guildIdValid =
    trimmedGuildId === "" || GUILD_ID_PATTERN.test(trimmedGuildId);

  const openInvite = () => {
    window.open(
      buildDiscordBotInviteUrl({
        guildId: GUILD_ID_PATTERN.test(trimmedGuildId)
          ? trimmedGuildId
          : undefined,
      }),
      "_blank",
      "noopener,noreferrer",
    );
  };

  const openApp = () => {
    window.location.href = discordAppDeepLink();
  };

  const confirm = () => {
    void completeDiscordConnect(request, {
      connected: true,
      guildId: trimmedGuildId || null,
      botToken: trimmedBotToken || undefined,
    });
  };

  const dismiss = () => {
    void completeDiscordConnect(request, { connected: false });
  };

  return (
    <ModalBackdrop
      closeOnEscape={false}
      closeOnBackdropClick={false}
      aria-label={title}
    >
      <ModalBody testID="discord-connect-modal" width="md">
        <div className="flex flex-col items-center gap-2 text-center">
          <MessageCircle className="size-8 text-discord" aria-hidden />
          <BaseModalTitle title={title} />
          <BaseModalDescription
            description={t(I18nKey.DISCORD$CONNECT_DESCRIPTION)}
          />
        </div>

        <div className="flex w-full flex-col gap-4">
          <p className="text-sm leading-5 text-tertiary-light">
            {t(I18nKey.DISCORD$CONNECT_STEPS)}
          </p>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="discord-guild-id"
              className="text-sm font-medium text-contrast"
            >
              {t(I18nKey.DISCORD$CONNECT_SERVER_ID_LABEL)}
            </label>
            <input
              id="discord-guild-id"
              data-testid="discord-guild-id-input"
              type="text"
              inputMode="numeric"
              value={guildId}
              onChange={(event) => setGuildId(event.target.value)}
              placeholder={t(I18nKey.DISCORD$CONNECT_SERVER_ID_PLACEHOLDER)}
              className="w-full rounded-lg border border-border bg-base-secondary px-3 py-2 text-sm text-contrast outline-none focus:border-discord"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <BrandButton
              type="button"
              variant="primary"
              testId="discord-connect-add-bot"
              onClick={openInvite}
            >
              <ExternalLink className="size-4" aria-hidden />
              {t(I18nKey.DISCORD$CONNECT_ADD_BOT)}
            </BrandButton>
            <BrandButton
              type="button"
              variant="secondary"
              testId="discord-connect-open-app"
              onClick={openApp}
            >
              {t(I18nKey.DISCORD$CONNECT_OPEN_APP)}
            </BrandButton>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="discord-bot-token"
              className="flex items-center gap-1.5 text-sm font-medium text-contrast"
            >
              <KeyRound className="size-3.5" aria-hidden />
              {t(I18nKey.DISCORD$CONNECT_BOT_TOKEN_LABEL)}
            </label>
            <input
              id="discord-bot-token"
              data-testid="discord-bot-token-input"
              type="password"
              autoComplete="off"
              value={botToken}
              onChange={(event) => setBotToken(event.target.value)}
              placeholder={t(I18nKey.DISCORD$CONNECT_BOT_TOKEN_PLACEHOLDER)}
              className="w-full rounded-lg border border-border bg-base-secondary px-3 py-2 text-sm text-contrast outline-none focus:border-discord"
            />
          </div>

          <p className="text-xs leading-4 text-muted">
            {t(I18nKey.DISCORD$CONNECT_TOKEN_NOTE)}
          </p>
        </div>

        <div className="flex w-full justify-end gap-2">
          <BrandButton
            type="button"
            variant="secondary"
            testId="discord-connect-cancel"
            onClick={dismiss}
          >
            {t(I18nKey.BUTTON$CANCEL)}
          </BrandButton>
          <BrandButton
            type="button"
            variant="primary"
            testId="discord-connect-confirm"
            isDisabled={!guildIdValid}
            onClick={confirm}
          >
            {t(I18nKey.DISCORD$CONNECT_CONFIRM)}
          </BrandButton>
        </div>
      </ModalBody>
    </ModalBackdrop>
  );
}
