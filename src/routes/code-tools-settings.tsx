import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { Typography } from "#/ui/typography";
import { SettingsSwitch } from "#/components/features/settings/settings-switch";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import {
  CRITIQUE_STRICTNESS_LEVELS,
  type CritiqueStrictness,
  useCodeToolsSettingsStore,
} from "#/stores/code-tools-settings-store";

const STRICTNESS_LABEL_KEYS: Record<CritiqueStrictness, I18nKey> = {
  relaxed: I18nKey.SETTINGS$CODE_TOOLS_STRICTNESS_RELAXED,
  normal: I18nKey.SETTINGS$CODE_TOOLS_STRICTNESS_NORMAL,
  strict: I18nKey.SETTINGS$CODE_TOOLS_STRICTNESS_STRICT,
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 border-b border-border pb-6 last:border-b-0 last:pb-0">
      <div className="space-y-1">
        <Typography.H3>{title}</Typography.H3>
        <p className="text-sm leading-5 text-tertiary-light">{description}</p>
      </div>
      {children}
    </section>
  );
}

/**
 * Settings for the code tooling the agent and the UI Preview rely on: how
 * loudly `code_critique` reports, and how the Preview tab renders and
 * refreshes. Persisted locally (frontend behaviour, not agent settings).
 */
export function CodeToolsSettingsScreen() {
  const { t } = useTranslation("openhands");
  const {
    critiqueStrictness,
    previewAutoRefresh,
    previewAllowScripts,
    setCritiqueStrictness,
    setPreviewAutoRefresh,
    setPreviewAllowScripts,
    reset,
  } = useCodeToolsSettingsStore();

  return (
    <div
      data-testid="code-tools-settings-screen"
      className="flex flex-col gap-6"
    >
      <div className="space-y-1">
        <Typography.H2>{t(I18nKey.SETTINGS$NAV_CODE_TOOLS)}</Typography.H2>
        <p
          data-testid="settings-page-subtitle"
          className="text-sm leading-5 text-tertiary-light"
        >
          {t(I18nKey.SETTINGS$PAGE_CODE_TOOLS_SUBLINE)}
        </p>
      </div>

      <Section
        title={t(I18nKey.SETTINGS$CODE_TOOLS_CRITIQUE_TITLE)}
        description={t(I18nKey.SETTINGS$CODE_TOOLS_CRITIQUE_DESCRIPTION)}
      >
        <SettingsDropdownInput
          testId="code-tools-strictness"
          name="critique-strictness"
          label={t(I18nKey.SETTINGS$CODE_TOOLS_STRICTNESS_LABEL)}
          selectedKey={critiqueStrictness}
          items={CRITIQUE_STRICTNESS_LEVELS.map((level) => ({
            key: level,
            label: t(STRICTNESS_LABEL_KEYS[level]),
          }))}
          onSelectionChange={(key) => {
            if (key) setCritiqueStrictness(key as CritiqueStrictness);
          }}
        />
      </Section>

      <Section
        title={t(I18nKey.SETTINGS$CODE_TOOLS_PREVIEW_TITLE)}
        description={t(I18nKey.SETTINGS$CODE_TOOLS_PREVIEW_DESCRIPTION)}
      >
        <SettingsSwitch
          testId="code-tools-preview-auto-refresh"
          isToggled={previewAutoRefresh}
          onToggle={setPreviewAutoRefresh}
        >
          {t(I18nKey.SETTINGS$CODE_TOOLS_PREVIEW_AUTO_REFRESH)}
        </SettingsSwitch>
        <SettingsSwitch
          testId="code-tools-preview-allow-scripts"
          isToggled={previewAllowScripts}
          onToggle={setPreviewAllowScripts}
        >
          {t(I18nKey.SETTINGS$CODE_TOOLS_PREVIEW_ALLOW_SCRIPTS)}
        </SettingsSwitch>
        <p className="text-sm leading-5 text-tertiary-light">
          {t(I18nKey.SETTINGS$CODE_TOOLS_PREVIEW_ALLOW_SCRIPTS_HELP)}
        </p>
      </Section>

      <div>
        <BrandButton
          testId="code-tools-reset"
          type="button"
          variant="secondary"
          onClick={reset}
        >
          {t(I18nKey.SETTINGS$CODE_TOOLS_RESET)}
        </BrandButton>
      </div>
    </div>
  );
}

export default CodeToolsSettingsScreen;
