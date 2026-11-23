import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppConversationStartTaskStatus } from "#/api/conversation-service/agent-server-conversation-service.types";
import { cn } from "#/utils/utils";
import { getTaskStatusI18nKey } from "#/utils/status";

interface StartTaskStatusIndicatorProps {
  taskStatus: AppConversationStartTaskStatus;
}

/**
 * A compact play badge instead of a flat status dot. In-progress states use an
 * animated gradient that shifts colour smoothly; READY/ERROR settle into a
 * static colour so the terminal state reads instantly.
 */
export function StartTaskStatusIndicator({
  taskStatus,
}: StartTaskStatusIndicatorProps) {
  const { t } = useTranslation("openhands");
  const label = t(getTaskStatusI18nKey(taskStatus));
  const isReady = taskStatus === "READY";
  const isError = taskStatus === "ERROR";
  const isActive = !isReady && !isError;

  return (
    <span
      data-testid="start-task-status-indicator"
      data-status={taskStatus}
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex size-6 shrink-0 items-center justify-center rounded-full",
        "border shadow-[0_0_10px_rgba(255,255,255,0.08)]",
        "transition-[background-color,border-color,color,box-shadow] duration-700 ease-out",
        isReady &&
          "border-status-success/50 bg-status-success/15 text-status-success",
        isError &&
          "border-status-error/50 bg-status-error/15 text-status-error",
        isActive && "status-play-gradient border-white/25 text-white",
      )}
    >
      <Play
        className={cn(
          "size-3 translate-x-px",
          isActive && "animate-[status-play-pulse_1.6s_ease-in-out_infinite]",
        )}
        fill="currentColor"
        strokeWidth={0}
        aria-hidden
      />
    </span>
  );
}
