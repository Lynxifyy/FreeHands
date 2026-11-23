import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import CircleIcon from "#/icons/u-circle.svg?react";
import CheckCircleIcon from "#/icons/u-check-circle.svg?react";
import CheckCircleHalfIcon from "#/icons/u-check-circle-half.svg?react";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { Typography } from "#/ui/typography";

interface TaskItemProps {
  task: {
    id: string;
    title: string;
    status: "todo" | "in_progress" | "done";
    notes?: string;
  };
}

/**
 * One task rendered as a soft "bubble". Each status gets its own tinted bubble
 * and a motion entrance so a plan that grows item by item reads as live work
 * instead of a static list.
 */
export function TaskItem({ task }: TaskItemProps) {
  const { t } = useTranslation("openhands");

  const icon = useMemo(() => {
    switch (task.status) {
      case "todo":
        return <CircleIcon className="h-4 w-4 text-muted" />;
      case "in_progress":
        return (
          <CheckCircleHalfIcon className="h-4 w-4 animate-spin text-logo [animation-duration:2.4s]" />
        );
      case "done":
        return <CheckCircleIcon className="h-4 w-4 text-success" />;
      default:
        return <CircleIcon className="h-4 w-4 text-muted" />;
    }
  }, [task.status]);

  const isDoneStatus = task.status === "done";
  const isActive = task.status === "in_progress";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      data-testid="task-bubble"
      data-status={task.status}
      data-active={isActive ? "true" : "false"}
      className={cn(
        "w-full rounded-2xl border px-3 py-2",
        "transition-colors duration-300",
        task.status === "todo" &&
          "border-border/70 bg-surface-raised/40 text-contrast",
        isActive &&
          "task-bubble-active border-transparent bg-[linear-gradient(135deg,rgba(59,130,246,0.22),rgba(168,85,247,0.22),rgba(236,72,153,0.18))] text-contrast shadow-[0_8px_24px_-14px_rgba(168,85,247,0.9)]",
        isDoneStatus && "border-success/25 bg-success/10 text-muted",
      )}
    >
      <div data-name="item" className="flex w-full items-center gap-2.5">
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
            isActive && "bg-white/10",
            isDoneStatus && "bg-success/15",
            task.status === "todo" && "bg-white/5",
          )}
        >
          {icon}
        </div>
        <div className="flex min-w-0 flex-col items-start justify-center leading-4">
          <Typography.Text
            className={cn(
              "text-xs",
              isDoneStatus ? "text-muted line-through" : "text-contrast",
            )}
          >
            {task.title}
          </Typography.Text>
          {task.notes && (
            <Typography.Text className="text-[10px] text-muted">
              {t(I18nKey.TASK_TRACKING_OBSERVATION$TASK_NOTES)}: {task.notes}
            </Typography.Text>
          )}
        </div>
      </div>
    </motion.div>
  );
}
