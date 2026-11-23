import { useTranslation } from "react-i18next";
import { NavigationLink } from "#/components/shared/navigation-link";
import { OliRobotHead } from "#/components/features/chat/oli-robot-head";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

const DEFAULT_LOGO_WIDTH = 46;
const DEFAULT_LOGO_HEIGHT = 30;

/**
 * Width at which the sidebar/header slot is wide enough for the FreeHands
 * wordmark next to Oli's head. Narrower slots (the 34px sidebar rail) show the
 * head alone so the mark never clips.
 */
const WORDMARK_MIN_WIDTH = 92;

export type OpenHandsLogoButtonProps = {
  className?: string;
  /** Applied to the wordmark (e.g. `max-w-none` in a narrow flex slot). */
  logoClassName?: string;
  /** Text-color utility applied to the wordmark. */
  colorClassName?: string;
  logoWidth?: number;
  logoHeight?: number;
};

/**
 * FreeHands' home link. The component keeps its historical name so existing
 * imports and test mocks keep working, but renders Oli's robot head (the
 * FreeHands brand mark) instead of the OpenHands wordmark.
 */
export function OpenHandsLogoButton({
  className,
  logoClassName,
  colorClassName = "text-contrast",
  logoWidth = DEFAULT_LOGO_WIDTH,
  logoHeight = DEFAULT_LOGO_HEIGHT,
}: OpenHandsLogoButtonProps = {}) {
  const { t } = useTranslation("openhands");

  const ariaLabel = t(I18nKey.BRANDING$OPENHANDS_LOGO);
  const markSize = Math.max(logoHeight, 20);
  const showWordmark = logoWidth >= WORDMARK_MIN_WIDTH;

  return (
    <NavigationLink
      to="/conversations"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center gap-1.5", className)}
    >
      <span
        data-testid="freehands-brand-mark"
        className="inline-flex items-center gap-1.5"
      >
        <OliRobotHead
          status="thinking"
          size={markSize}
          animate={false}
          testId="freehands-logo-oli"
        />
        {showWordmark ? (
          <span
            data-testid="freehands-wordmark"
            className={cn(
              "text-[15px] font-semibold leading-none tracking-tight",
              colorClassName,
              logoClassName,
            )}
          >
            {t(I18nKey.BRANDING$OPENHANDS)}
          </span>
        ) : null}
      </span>
    </NavigationLink>
  );
}
