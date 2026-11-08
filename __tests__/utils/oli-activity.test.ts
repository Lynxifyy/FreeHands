import { describe, expect, it } from "vitest";

import {
  OLI_SUBAGENT_TYPE,
  deriveOliStatus,
  isOliSubagent,
} from "#/utils/oli-activity";
import {
  SecurityRisk,
  type ActionEvent,
  type ObservationEvent,
} from "#/types/agent-server/core";
import type { Action } from "#/types/agent-server/core/base/action";
import type { OHEvent } from "#/stores/use-event-store";

const makeActionEvent = (id: string, action: Action): ActionEvent => ({
  id,
  timestamp: `2026-07-27T18:00:${id.padStart(2, "0")}Z`,
  source: "agent",
  thought: [],
  thinking_blocks: [],
  action,
  tool_name: action.kind,
  tool_call_id: `tool-${id}`,
  tool_call: {
    id: `tool-${id}`,
    type: "function",
    function: { name: action.kind, arguments: "{}" },
  },
  llm_response_id: `response-${id}`,
  security_risk: SecurityRisk.LOW,
});

const taskAction = (id: string, subagent: string): ActionEvent =>
  makeActionEvent(id, {
    kind: "TaskAction",
    prompt: "Write the feature",
    subagent_type: subagent,
    description: "Delegate to a coder",
  });

const taskObservation = (
  id: string,
  action: ActionEvent,
): ObservationEvent => ({
  id,
  timestamp: `2026-07-27T18:01:${id.padStart(2, "0")}Z`,
  source: "environment",
  tool_name: action.tool_name,
  tool_call_id: action.tool_call_id,
  action_id: action.id,
  observation: {
    kind: "TaskObservation",
    content: [],
    task_id: "task-1",
    subagent: "oli",
    status: "completed",
  },
});

const writeAction = (id: string, command: "view" | "create"): ActionEvent =>
  makeActionEvent(id, {
    kind: "FileEditorAction",
    command,
    path: "src/app.tsx",
    file_text: command === "create" ? "export {};" : null,
    old_str: null,
    new_str: null,
    insert_line: null,
    view_range: null,
  });

describe("isOliSubagent", () => {
  it("matches the Oli coder and its variants, case-insensitively", () => {
    expect(isOliSubagent(OLI_SUBAGENT_TYPE)).toBe(true);
    expect(isOliSubagent("Oli")).toBe(true);
    expect(isOliSubagent("oli-coder")).toBe(true);
  });

  it("does not match other subagents", () => {
    expect(isOliSubagent("browser")).toBe(false);
    expect(isOliSubagent("oliver")).toBe(false);
    expect(isOliSubagent(null)).toBe(false);
    expect(isOliSubagent(undefined)).toBe(false);
  });
});

describe("deriveOliStatus", () => {
  it("is null when no Oli delegation is in flight", () => {
    expect(deriveOliStatus([])).toBeNull();
    expect(deriveOliStatus([writeAction("1", "create")])).toBeNull();
    expect(deriveOliStatus([taskAction("1", "browser")])).toBeNull();
  });

  it("reports thinking while an Oli delegation is unresolved", () => {
    expect(deriveOliStatus([taskAction("1", "oli")])).toBe("thinking");
  });

  it("stops once the delegation resolves", () => {
    const delegation = taskAction("1", "oli");

    expect(
      deriveOliStatus([delegation, taskObservation("2", delegation)]),
    ).toBeNull();
  });

  it("reports coding when Oli is writing a file", () => {
    expect(
      deriveOliStatus([taskAction("1", "oli"), writeAction("2", "create")]),
    ).toBe("coding");
  });

  it("stays thinking when Oli only reads a file", () => {
    expect(
      deriveOliStatus([taskAction("1", "oli"), writeAction("2", "view")]),
    ).toBe("thinking");
  });

  it("ignores planning-agent events", () => {
    const planningOnly = {
      ...taskAction("1", "oli"),
      isFromPlanningAgent: true,
    } satisfies OHEvent;

    expect(deriveOliStatus([planningOnly])).toBeNull();
  });
});
