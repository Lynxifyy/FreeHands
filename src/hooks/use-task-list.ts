import { useMemo } from "react";
import { useEventStore } from "#/stores/use-event-store";
import { isObservationEvent } from "#/types/agent-server/type-guards";
import type { TaskTrackerObservation } from "#/types/agent-server/core/base/observation";
import type { ObservationEvent } from "#/types/agent-server/core/events/observation-event";

export interface TaskListItem {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  notes?: string;
}

export interface TaskListProgress {
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  /** Done share of the list, rounded to the nearest whole percent. */
  percent: number;
  /** Id of the task currently in progress, or null when none is. */
  currentTaskId: string | null;
}

export function computeTaskProgress(
  taskList: TaskListItem[],
): TaskListProgress {
  let done = 0;
  let inProgress = 0;
  let todo = 0;
  let currentTaskId: string | null = null;
  for (const task of taskList) {
    if (task.status === "done") done += 1;
    else if (task.status === "in_progress") {
      inProgress += 1;
      if (currentTaskId === null) currentTaskId = task.id;
    } else todo += 1;
  }
  const total = taskList.length;
  return {
    total,
    done,
    inProgress,
    todo,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    currentTaskId,
  };
}

function getTaskListFromEvent(
  event: ReturnType<typeof useEventStore.getState>["events"][number],
): TaskListItem[] | null {
  if (
    isObservationEvent(event) &&
    event.observation.kind === "TaskTrackerObservation"
  ) {
    const obs = (event as ObservationEvent<TaskTrackerObservation>).observation;
    if (obs.command === "plan") {
      return obs.task_list.map((t, i) => ({
        id: String(i + 1),
        title: t.title,
        status: t.status,
        notes: t.notes || undefined,
      }));
    }
  }

  return null;
}

export function useTaskList() {
  const events = useEventStore((state) => state.events);

  return useMemo(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const taskList = getTaskListFromEvent(events[i]);
      if (taskList) {
        return {
          taskList,
          hasTaskList: taskList.length > 0,
          progress: computeTaskProgress(taskList),
        };
      }
    }

    return {
      taskList: [] as TaskListItem[],
      hasTaskList: false,
      progress: computeTaskProgress([]),
    };
  }, [events]);
}
