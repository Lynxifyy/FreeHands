import React from "react";
import { useTranslation } from "react-i18next";
import { FaGithub } from "react-icons/fa6";
import toast from "react-hot-toast";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackendContext } from "#/contexts/active-backend-context";
import { DeviceFlowAuth } from "#/components/features/backends/device-flow-auth";
import { ModalBackdrop } from "#/components/shared/modals/modal-backdrop";
import { ModalBody } from "#/components/shared/modals/modal-body";
import { ModalCloseButton } from "#/components/shared/modals/modal-close-button";
import { BaseModalTitle } from "#/components/shared/modals/confirmation-modals/base-modal";
import { Typography } from "#/ui/typography";
import { cn } from "#/utils/utils";
import { getLockedCloudHost } from "#/api/agent-server-config";

const CLOUD_HOST = "https://app.all-hands.dev";

/**
 * Prominent entry point for the hosted FreeHands Cloud account, which is the
 * only way to get cloud-persisted conversations and managed (no-key) models.
 * Hidden once a cloud backend is registered, and on deployments locked to a
 * different cloud host, where the backend switcher already owns the flow.
 */
export function CloudSignInBanner() {
  const { t } = useTranslation("openhands");
  const { backends, addBackend } = useActiveBackendContext();
  const [isOpen, setIsOpen] = React.useState(false);

  const hasCloudBackend = backends.some((backend) => backend.kind === "cloud");

  if (hasCloudBackend || getLockedCloudHost() !== null) {
    return null;
  }

  const handleSuccess = (apiKey: string) => {
    addBackend({
      name: t(I18nKey.BACKEND$CLOUD_TITLE),
      host: CLOUD_HOST,
      apiKey,
      kind: "cloud",
    });
    setIsOpen(false);
    toast.success(t(I18nKey.AUTH$SIGN_IN_WITH_GITHUB_SUCCESS));
  };

  return (
    <>
      <div
        data-testid="cloud-sign-in-banner"
        className={cn(
          "mt-3 flex w-full flex-col gap-3 rounded-xl border border-border",
          "bg-surface-raised px-4 py-3 text-foreground sm:flex-row sm:items-center sm:justify-between sm:py-4",
        )}
      >
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <FaGithub
            aria-hidden
            className="mt-0.5 h-5 w-5 shrink-0 text-foreground sm:mt-0"
          />
          <div className="min-w-0">
            <Typography.Text className="block text-sm font-medium">
              {t(I18nKey.AUTH$SIGN_IN_WITH_GITHUB)}
            </Typography.Text>
            <Typography.Text className="block text-xs text-muted">
              {t(I18nKey.AUTH$SIGN_IN_WITH_GITHUB_DESCRIPTION)}
            </Typography.Text>
          </div>
        </div>

        <button
          type="button"
          data-testid="cloud-sign-in-banner-action"
          onClick={() => setIsOpen(true)}
          className={cn(
            "w-fit shrink-0 self-start whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium",
            "border border-border bg-surface text-foreground transition-colors",
            "hover:bg-surface-raised sm:self-auto",
          )}
        >
          {t(I18nKey.AUTH$SIGN_IN_WITH_GITHUB_ACTION)}
        </button>
      </div>

      {isOpen && (
        <ModalBackdrop onClose={() => setIsOpen(false)}>
          <ModalBody>
            <ModalCloseButton onClose={() => setIsOpen(false)} />
            <BaseModalTitle title={t(I18nKey.BACKEND$CLOUD_TITLE)} />
            <DeviceFlowAuth
              host={CLOUD_HOST}
              onSuccess={handleSuccess}
              testIdRoot="cloud-sign-in-banner"
              idleDescription={
                <p className="text-center text-sm leading-relaxed text-muted">
                  {t(I18nKey.BACKEND$CLOUD_DESCRIPTION)}
                </p>
              }
              className="w-full items-center"
            />
          </ModalBody>
        </ModalBackdrop>
      )}
    </>
  );
}
