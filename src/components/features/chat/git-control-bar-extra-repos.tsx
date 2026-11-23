import { GitFork, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";

interface AddRepositoryButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/** Opens the repository picker to clone one more repository into this chat. */
export function GitControlBarAddRepositoryButton({
  onClick,
  disabled,
}: AddRepositoryButtonProps) {
  const { t } = useTranslation("openhands");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={t(I18nKey.CONVERSATION$ADD_REPOSITORY_TOOLTIP)}
      aria-label={t(I18nKey.CONVERSATION$ADD_REPOSITORY)}
      className="flex shrink-0 items-center gap-1 rounded-[100px] border border-[rgba(71,74,84,0.50)] px-2 py-1 text-sm leading-5 text-contrast transition-colors enabled:hover:border-border-subtle enabled:hover:bg-surface-secondary disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
      <span className="hidden sm:inline">
        {t(I18nKey.CONVERSATION$ADD_REPOSITORY)}
      </span>
    </button>
  );
}

interface ExtraRepositoryChipProps {
  repository: string;
}

/** Read-only chip for an additional repository cloned into this chat. */
export function GitControlBarExtraRepositoryChip({
  repository,
}: ExtraRepositoryChipProps) {
  const { t } = useTranslation("openhands");
  return (
    <span
      title={`${t(I18nKey.CONVERSATION$EXTRA_REPOSITORY_TOOLTIP)}: ${repository}`}
      className="flex shrink-0 items-center gap-1.5 rounded-[100px] border border-[rgba(71,74,84,0.50)] px-2.5 py-1 text-sm leading-5 text-contrast"
    >
      <GitFork className="h-3 w-3" aria-hidden />
      <span className="max-w-[12rem] truncate">{repository}</span>
    </span>
  );
}
