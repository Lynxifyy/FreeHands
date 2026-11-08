import { useTranslation } from "react-i18next";
import { Cloud, ExternalLink } from "lucide-react";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { isNoBackend } from "#/api/backend-registry/active-store";
import { appSettingsLinkAttributes } from "#/utils/app-settings-link";
import { cn } from "#/utils/utils";
import {
  SIDEBAR_ICON_SLOT_CLASS,
  SIDEBAR_ROW_INTERACTIVE_CLASS,
  sidebarNavLabelClassName,
  sidebarNavRowClassName,
} from "#/components/features/sidebar/sidebar-layout";

/**
 * Renders only for cloud backends — local backends have no equivalent
 * hosted settings page. Navigates in place when the settings page shares the
 * canvas origin (locked-to-Cloud, OHE-3242) and opens a new tab otherwise;
 * inside the packaged app a cross-origin page renders nothing rather than a
 * link the app cannot follow.
 */
export function CloudSettingsLink() {
  const { t } = useTranslation("openhands");
  const { active } = useActiveBackendContext();
  const { backend, orgId } = active;

  if (isNoBackend(backend) || backend.kind !== "cloud") return null;

  // `org` is consumed by the cloud settings loader so the page opens on the
  // org that is active here instead of the cloud's last-used org.
  const orgQuery = orgId ? `?org=${encodeURIComponent(orgId)}` : "";
  const cloudSettingsUrl = `${backend.host.replace(/\/+$/, "")}/settings${orgQuery}`;
  const link = appSettingsLinkAttributes(cloudSettingsUrl);

  if (!link) return null;

  return (
    <a
      data-testid="settings-cloud-link"
      href={link.href}
      target={link.target}
      rel={link.rel}
      className={cn(
        sidebarNavRowClassName({ collapsed: false }),
        SIDEBAR_ROW_INTERACTIVE_CLASS.idle,
      )}
    >
      <span className={SIDEBAR_ICON_SLOT_CLASS}>
        <Cloud className="size-4 shrink-0" aria-hidden />
      </span>
      <span className={cn(sidebarNavLabelClassName(false), "flex-1")}>
        {t(I18nKey.SETTINGS$CLOUD_SETTINGS_LINK)}
      </span>
      {link.target === "_blank" && (
        <ExternalLink className="size-4 shrink-0 text-muted" aria-hidden />
      )}
    </a>
  );
}
