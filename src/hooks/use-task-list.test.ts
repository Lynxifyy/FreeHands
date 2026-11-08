import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useEventStore, type OHEvent } from "#/stores/use-event-store";
import type { ObservationEvent } from "#/types/agent-server/core";
import type { TaskItem } from "#/types/agent-server/core/base/common";
import type { TaskTrackerObservation } from "#/types/agent-server/core/base/observation";
import { useTaskList } from "./use-task-list";

const task = (title: string, status: TaskItem["status"]): TaskItem => ({
  title,
  notes: "",
  status,
});

const planEvent = (
  id: string,
  taskList: TaskItem[],
  timestamp: string,
): ObservationEvent<TaskTrackerObservation> => ({
  id,
  timestamp,
  source: "environment",
  tool_name: "task_tracker",
  tool_call_id: `call-${id}`,
  action_id: `action-${id}`,
  observation: {
    kind: "TaskTrackerObservation",
    content: "Current plan",
    command: "plan",
    task_list: taskList,
  },
});

const renderTaskList = (events: OHEvent[]) => {
  useEventStore.setState({ events });
  return renderHook(() => useTaskList());
};

afterEach(() => {
  useEventStore.setState({ events: [] });
});

describe("useTaskList", () => {
  it("reads the newest plan rather than the first one", () => {
    const { result } = renderTaskList([
      planEvent(
        "first",
        [task("Write the code", "in_progress"), task("Ship it", "todo")],
        "2026-07-13T12:00:00.000Z",
      ),
      planEvent(
        "second",
        [task("Write the code", "done"), task("Ship it", "in_progress")],
        "2026-07-13T12:05:00.000Z",
      ),
    ]);

    expect(result.current.taskList.map((item) => item.status)).toEqual([
      "done",
      "in_progress",
    ]);
    expect(result.current.progress).toMatchObject({
      total: 2,
      done: 1,
      inProgress: 1,
      todo: 0,
      percent: 50,
    });
  });

  it("reports no task list before a plan has been written", () => {
    const { result } = renderTaskList([]);

    expect(result.current.hasTaskList).toBe(false);
    expect(result.current.taskList).toEqual([]);
    expect(result.current.progress.percent).toBe(0);
  });
});
