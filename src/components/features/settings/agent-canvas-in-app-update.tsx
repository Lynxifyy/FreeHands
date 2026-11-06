import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Download, Loader2 } from "lucide-react";

import {
  pickReleaseAsset,
  fetchLatestAgentCanvasRelease,
  type AgentCanvasRelease,
} from "#/api/agent-canvas-updates";
import { compareAgentServerVersions } from "#/api/agent-server-compatibility";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import {
  getAppUpdaterBridge,
  isInAppUpdateSupported,
  pickPlatformForShell,
} from "#/utils/app-updater";

type InstallState =
  | { kind: "idle" }
  | { kind: "downloading"; percent: number | null }
  | { kind: "done" }
  | { kind: "error"; message: string };

/**
 * "Download and install" control for the Android shell. A browser tab renders
 * nothing (it cannot install an APK). Inside the app it checks the FreeHands
 * release, then hands the APK to the native installer; the user still taps
 * through Android's own install confirmation.
 */
export function AgentCanvasInAppUpdate() {
  const { t } = useTranslation("openhands");
  const supported = isInAppUpdateSupported();
  const [release, setRelease] = useState<AgentCanvasRelease | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [state, setState] = useState<InstallState>({ kind: "idle" });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!supported) return;
    const bridge = getAppUpdaterBridge();
    let cancelled = false;
    void (async () => {
      const [releaseResult, versionResult] = await Promise.allSettled([
        fetchLatestAgentCanvasRelease(),
        bridge ? bridge.getInstalledVersion() : Promise.resolve(null),
      ]);
      if (cancelled) return;
      if (releaseResult.status === "fulfilled") {
        setRelease(releaseResult.value);
      }
      if (versionResult.status === "fulfilled" && versionResult.value) {
        setInstalledVersion(versionResult.value);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const install = useCallback(async () => {
    const bridge = getAppUpdaterBridge();
    const platform = pickPlatformForShell(true);
    if (!bridge || !platform || !release) return;
    const asset = pickReleaseAsset(release.assets, platform);
    if (!asset) {
      setState({
        kind: "error",
        message: t(I18nKey.SETTINGS$APP_UPDATE_NO_ASSET),
      });
      return;
    }

    setState({ kind: "downloading", percent: null });
    try {
      await bridge.downloadAndInstall(
        asset.browser_download_url,
        (progress) => {
          if (!mountedRef.current) return;
          const percent =
            progress.total > 0
              ? Math.round((progress.received / progress.total) * 100)
              : null;
          setState({ kind: "downloading", percent });
        },
      );
      if (mountedRef.current) setState({ kind: "done" });
    } catch (error) {
      if (!mountedRef.current) return;
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [release, t]);

  if (!supported) return null;

  const latestVersion = release?.version ?? null;
  const updateAvailable =
    latestVersion !== null && installedVersion !== null
      ? compareAgentServerVersions(latestVersion, installedVersion) === 1
      : null;

  if (updateAvailable === false) return null;

  return (
    <div
      data-testid="in-app-update"
      className="flex flex-col gap-3 rounded-lg border border-border bg-base-secondary px-3 py-3"
    >
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-contrast">
          {t(I18nKey.SETTINGS$APP_UPDATE_CARD_TITLE)}
        </span>
        {latestVersion ? (
          <span className="text-xs text-muted">
            {t(I18nKey.SETTINGS$APP_UPDATE_IN_APP_MESSAGE, {
              version: latestVersion,
            })}
          </span>
        ) : null}
      </div>

      {state.kind === "downloading" ? (
        <div
          data-testid="in-app-update-progress"
          className="flex items-center gap-2 text-xs text-muted"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {state.percent === null
            ? t(I18nKey.SETTINGS$APP_UPDATE_DOWNLOADING)
            : t(I18nKey.SETTINGS$APP_UPDATE_DOWNLOADING_PERCENT, {
                percent: state.percent,
              })}
        </div>
      ) : state.kind === "done" ? (
        <div
          data-testid="in-app-update-done"
          className="flex items-center gap-2 text-xs text-status-success"
        >
          <CheckCircle2 className="size-4" aria-hidden />
          {t(I18nKey.SETTINGS$APP_UPDATE_INSTALL_PROMPT)}
        </div>
      ) : (
        <>
          <BrandButton
            testId="in-app-update-install"
            type="button"
            variant="primary"
            isDisabled={!release}
            onClick={() => void install()}
            startContent={<Download className="size-4" aria-hidden />}
          >
            {t(I18nKey.SETTINGS$APP_UPDATE_DOWNLOAD_INSTALL)}
          </BrandButton>
          {state.kind === "error" ? (
            <span
              data-testid="in-app-update-error"
              className="text-xs text-status-error"
            >
              {state.message}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}
