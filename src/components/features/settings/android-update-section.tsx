import { Capacitor } from "@capacitor/core";
import { Download, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AGENT_CANVAS_CLIENT_VERSION } from "#/api/client-source";
import { compareAgentServerVersions } from "#/api/agent-server-compatibility";
import { MarkdownRenderer } from "#/components/features/markdown/markdown-renderer";
import { useLatestFreeHandsRelease } from "#/hooks/query/use-latest-freehands-release";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";

/**
 * Android-specific update surface. Rendered inside the existing version card
 * so an Android install shows both the npm/desktop version and the APK it can
 * actually install, including the release's changes/fixes/features.
 */
export function AndroidUpdateSection() {
  const { t } = useTranslation("openhands");
  const isAndroid = Capacitor.getPlatform() === "android";
  const releaseQuery = useLatestFreeHandsRelease({ enabled: isAndroid });

  if (!isAndroid) return null;

  const release = releaseQuery.data ?? null;
  const comparison = release
    ? compareAgentServerVersions(release.version, AGENT_CANVAS_CLIENT_VERSION)
    : null;
  const updateAvailable = comparison === 1;

  return (
    <section
      data-testid="android-update-section"
      className="mt-2 flex flex-col gap-2 rounded-md border border-border bg-base-secondary px-3 py-2"
    >
      <div className="flex items-center gap-2">
        <Smartphone className="size-4 shrink-0 text-contrast" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-contrast">
          {t(I18nKey.SETTINGS$ANDROID_UPDATE_TITLE)}
        </span>
        <span className="shrink-0 text-xs text-muted">
          {release?.version ?? AGENT_CANVAS_CLIENT_VERSION}
        </span>
        {updateAvailable ? (
          <span className="shrink-0 rounded-full border border-[#1E3A5F] bg-[#1E3A5F] px-1.5 py-0.5 text-[10px] font-medium text-[#3B82F6]">
            {t(I18nKey.SETTINGS$ANDROID_UPDATE_AVAILABLE)}
          </span>
        ) : release ? (
          <span className="shrink-0 text-[10px] font-medium text-status-success">
            {t(I18nKey.SETTINGS$ANDROID_UP_TO_DATE)}
          </span>
        ) : null}
      </div>

      {updateAvailable && release?.apkUrl ? (
        <a
          data-testid="android-update-install"
          href={release.apkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex w-fit items-center gap-1.5 rounded-md bg-[#3B82F6] px-2.5 py-1.5",
            "text-xs font-medium text-white transition-colors hover:bg-[#2F6FE0]",
          )}
        >
          <Download className="size-3.5" aria-hidden />
          {t(I18nKey.SETTINGS$ANDROID_INSTALL)}
        </a>
      ) : null}

      {updateAvailable && release?.body ? (
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted hover:text-contrast">
            {t(I18nKey.SETTINGS$ANDROID_WHATS_NEW)}
          </summary>
          <div className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-canvas-base p-2 text-xs">
            <MarkdownRenderer>{release.body}</MarkdownRenderer>
          </div>
        </details>
      ) : null}

      {releaseQuery.isError ? (
        <p className="text-xs text-muted">
          {t(I18nKey.SETTINGS$ANDROID_UPDATE_CHECK_FAILED)}
        </p>
      ) : null}
    </section>
  );
}
