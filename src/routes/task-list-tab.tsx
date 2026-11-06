import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import CheckCircleIcon from "#/icons/u-check-circle.svg?react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TaskItem } from "#/components/features/chat/task-tracking/task-item";
import { useTaskList, type TaskListItem } from "#/hooks/use-task-list";
import { cn } from "#/utils/utils";
import { I18nKey } from "#/i18n/declaration";
import { ConversationTabEmptyState } from "#/components/features/conversation/conversation-tab-empty-state";

/** Progress header: a labelled bar plus the done/total count. */
function TaskProgressHeader({
  percent,
  done,
  total,
}: {
  percent: number;
  done: number;
  total: number;
}) {
  const { t } = useTranslation("openhands");
  const label = t(I18nKey.TASK_LIST$PROGRESS, { done, total });
  return (
    <div className="flex flex-col gap-1.5 border-b border-border px-4 py-3">
      <div className="flex items-center justify-between text-xs text-muted">
        <span data-testid="task-list-count">{label}</span>
        <span className="font-mono tabular-nums">{percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-raised"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-success transition-all duration-300"
          // runtime completion-percentage width
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function TaskRow({
  task,
  isCurrent,
}: {
  task: TaskListItem;
  isCurrent: boolean;
}) {
  const { t } = useTranslation("openhands");
  return (
    <div
      data-active={task.status === "in_progress" ? "true" : "false"}
      data-current={isCurrent ? "true" : "false"}
      className={cn(
        "flex flex-col gap-0.5 rounded px-4 py-2",
        isCurrent && "bg-surface-raised",
      )}
    >
      {isCurrent && (
        <span className="text-xs font-medium text-muted">
          {t(I18nKey.TASK_LIST$CURRENT)}
        </span>
      )}
      <TaskItem task={task} />
    </div>
  );
}

/**
 * Task List tab: the agent's task tracker plan with a progress summary, the
 * current task called out, and completed tasks folded into a collapsible
 * section so in-flight work stays at the top.
 */
function TaskListTab() {
  const { t } = useTranslation("openhands");
  const { taskList, progress } = useTaskList();
  const [showCompleted, setShowCompleted] = useState(true);

  const { active, completed } = useMemo(() => {
    const activeTasks: TaskListItem[] = [];
    const completedTasks: TaskListItem[] = [];
    for (const task of taskList) {
      if (task.status === "done") completedTasks.push(task);
      else activeTasks.push(task);
    }
    return { active: activeTasks, completed: completedTasks };
  }, [taskList]);

  if (taskList.length === 0) {
    return (
      <ConversationTabEmptyState icon={<CheckCircleIcon />}>
        {t(I18nKey.COMMON$NO_TASKS)}
      </ConversationTabEmptyState>
    );
  }

  return (
    <main className="h-full overflow-y-auto flex flex-col custom-scrollbar-always">
      <TaskProgressHeader
        percent={progress.percent}
        done={progress.done}
        total={progress.total}
      />

      {active.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          isCurrent={task.id === progress.currentTaskId}
        />
      ))}

      {completed.length > 0 && (
        <div className="mt-1 border-t border-border">
          <button
            type="button"
            data-testid="task-list-toggle-completed"
            aria-expanded={showCompleted}
            aria-label={t(I18nKey.TASK_LIST$TOGGLE_COMPLETED)}
            onClick={() => setShowCompleted((value) => !value)}
            className="flex w-full items-center gap-1.5 px-4 py-2 text-xs text-muted hover:text-contrast"
          >
            {showCompleted ? (
              <ChevronDown className="size-3.5" aria-hidden />
            ) : (
              <ChevronRight className="size-3.5" aria-hidden />
            )}
            {t(I18nKey.TASK_LIST$COMPLETED_SECTION, {
              count: completed.length,
            })}
          </button>
          {showCompleted && (
            <div data-testid="task-list-completed">
              {completed.map((task) => (
                <TaskRow key={task.id} task={task} isCurrent={false} />
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default TaskListTab;
