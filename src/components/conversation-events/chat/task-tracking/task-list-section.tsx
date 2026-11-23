import { useTranslation } from "react-i18next";
import { TaskItem } from "./task-item";
import LessonPlanIcon from "#/icons/lesson-plan.svg?react";
import { TaskItem as TaskItemType } from "#/types/agent-server/core/base/common";
import { I18nKey } from "#/i18n/declaration";
import { Typography } from "#/ui/typography";

interface TaskListSectionProps {
  taskList: TaskItemType[];
}

export function TaskListSection({ taskList }: TaskListSectionProps) {
  const { t } = useTranslation("openhands");

  return (
    <div className="flex w-full flex-col overflow-clip rounded-2xl border border-border/70 bg-surface">
      <div className="flex h-10 items-center gap-2 border-b border-border/60 bg-[linear-gradient(90deg,rgba(59,130,246,0.14),rgba(168,85,247,0.14),rgba(236,72,153,0.1))] px-3">
        <LessonPlanIcon className="h-4 w-4 shrink-0 text-logo" />
        <Typography.Text className="bg-gradient-to-r from-sky-400 via-violet-400 to-pink-400 bg-clip-text text-[11px] font-semibold tracking-wide text-transparent">
          {t(I18nKey.COMMON$TASKS)}
        </Typography.Text>
      </div>

      <div className="flex flex-col gap-1.5 p-2">
        {taskList.map((task, index) => (
          <TaskItem key={`task-${index}`} task={task} />
        ))}
      </div>
    </div>
  );
}
