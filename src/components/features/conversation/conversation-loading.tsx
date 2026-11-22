import { useTranslation } from "react-i18next";
import { TextShimmer } from "#/components/shared/text-shimmer";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { OliRobotHead } from "#/components/features/chat/oli-robot-head";
import { ThinkingOrb } from "#/components/features/chat/thinking-orb";

type ConversationLoadingProps = {
  className?: string;
};

/**
 * Opening a conversation shows Oli thinking rather than a generic spinner: the
 * same animated marks the live-activity chip uses, so a new chat reads as the
 * agent waking up instead of a stalled page.
 */
export function ConversationLoading({ className }: ConversationLoadingProps) {
  const { t } = useTranslation("openhands");

  return (
    <div
      className={cn(
        "bg-surface flex h-full w-full flex-col items-center justify-center gap-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-1.5" aria-hidden>
        <ThinkingOrb size={20} />
        <OliRobotHead status="thinking" size={20} />
      </div>
      <TextShimmer
        as="p"
        role="status"
        aria-live="polite"
        className="block w-full text-center text-sm font-normal leading-5"
        duration={0.7}
        spread={2}
      >
        {t(I18nKey.HOME$LOADING)}
      </TextShimmer>
    </div>
  );
}
