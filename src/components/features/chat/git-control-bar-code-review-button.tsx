import { useTranslation } from "react-i18next";
import CodeReviewIcon from "#/icons/u-code-review.svg?react";
import { cn, getCodeReviewPrompt } from "#/utils/utils";
import {
  gitControlBarActionButtonClassName,
  gitControlBarActionIconColor,
  gitControlBarActionLabelClassName,
} from "#/utils/git-control-bar-classes";
import { I18nKey } from "#/i18n/declaration";
import { useTracking } from "#/hooks/use-tracking";

interface GitControlBarCodeReviewButtonProps {
  onSuggestionsClick: (value: string) => void;
  hasRepository: boolean;
  providerTokensReady: boolean;
  isConversationReady?: boolean;
}

export function GitControlBarCodeReviewButton({
  onSuggestionsClick,
  hasRepository,
  providerTokensReady,
  isConversationReady = true,
}: GitControlBarCodeReviewButtonProps) {
  const { t } = useTranslation("openhands");
  const { trackCodeReviewButtonClick } = useTracking();

  const isButtonEnabled =
    providerTokensReady && hasRepository && isConversationReady;

  const handleCodeReviewClick = () => {
    trackCodeReviewButtonClick();
    onSuggestionsClick(getCodeReviewPrompt());
  };

  return (
    <button
      type="button"
      onClick={handleCodeReviewClick}
      disabled={!isButtonEnabled}
      className={cn(
        gitControlBarActionButtonClassName(isButtonEnabled),
        "px-2 py-1 w-24.5 min-w-24.5",
      )}
    >
      <div className="w-3 h-3 flex items-center justify-center">
        <CodeReviewIcon
          width={12}
          height={12}
          color={gitControlBarActionIconColor(isButtonEnabled)}
        />
      </div>
      <div
        className={cn(gitControlBarActionLabelClassName, "max-w-24.5")}
        title={t(I18nKey.COMMON$CODE_REVIEW)}
      >
        {t(I18nKey.COMMON$CODE_REVIEW)}
      </div>
    </button>
  );
}
