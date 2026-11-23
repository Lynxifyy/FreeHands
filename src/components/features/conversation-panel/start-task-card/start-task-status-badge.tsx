import { useTranslation } from "react-i18next";
import type { AppConversationStartTaskStatus } from "#/api/conversation-service/agent-server-conversation-service.types";
import { cn } from "#/utils/utils";
import { getTaskStatusI18nKey } from "#/utils/status";

interface StartTaskStatusBadgeProps {
  taskStatus: AppConversationStartTaskStatus;
}

export function StartTaskStatusBadge({
  taskStatus,
}: StartTaskStatusBadgeProps) {
  const { t } = useTranslation("openhands");

  // Don't show badge for WORKING status (most common, clutters UI)
  if (taskStatus === "WORKING") {
    return null;
  }

  const label = t(getTaskStatusI18nKey(taskStatus));

  return (
    <span
      data-testid="start-task-status-badge"
      data-status={taskStatus}
      className={cn(
        "max-w-[11rem] shrink-0 truncate rounded-full border px-2 py-0.5",
        "text-[10px] font-medium uppercase tracking-[0.08em] leading-4",
        "transition-colors duration-500",
        taskStatus === "READY" &&
          "border-status-success/25 bg-status-success/10 text-status-success",
        taskStatus === "ERROR" &&
          "border-status-error/25 bg-status-error/10 text-status-error",
        taskStatus !== "READY" &&
          taskStatus !== "ERROR" &&
          "border-feedback-warning/25 bg-feedback-warning/10 text-feedback-warning",
      )}
      title={label}
    >
      {label}
    </span>
  );
}
