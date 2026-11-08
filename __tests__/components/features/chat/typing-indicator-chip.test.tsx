import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TypingIndicator } from "#/components/features/chat/typing-indicator";
import { I18nKey } from "#/i18n/declaration";
import { RECOMMENDED_DEEPSEEK_MODEL } from "#/utils/format-model-name";
import {
  SecurityRisk,
  type ActionEvent,
  type ObservationEvent,
} from "#/types/agent-server/core";
import type { Action } from "#/types/agent-server/core/base/action";

// `t` echoes the key (the repo-wide convention) but records its arguments, so
// a test can assert the interpolation values the chip passes through.
const { t } = vi.hoisted(() => ({ t: vi.fn((key: string) => key) }));

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

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

beforeEach(() => {
  t.mockClear();
});

describe("TypingIndicator status", () => {
  it("names a DeepSeek model while it is thinking", () => {
    render(<TypingIndicator events={[]} model={RECOMMENDED_DEEPSEEK_MODEL} />);

    expect(screen.getByTestId("live-activity-chip")).toHaveTextContent(
      I18nKey.ACTION_MESSAGE$MODEL_THINKING,
    );
    expect(t).toHaveBeenCalledWith(I18nKey.ACTION_MESSAGE$MODEL_THINKING, {
      model: "DeepSeek V4.1 Flash",
    });
    expect(screen.queryByTestId("oli-robot-head")).not.toBeInTheDocument();
  });

  it("keeps the generic copy for a non-DeepSeek model", () => {
    render(<TypingIndicator events={[]} model="openai/gpt-5.6-sol" />);

    expect(screen.getByTestId("live-activity-chip")).toHaveTextContent(
      "ACTION_MESSAGE$THINK",
    );
    expect(t).not.toHaveBeenCalledWith(
      I18nKey.ACTION_MESSAGE$MODEL_THINKING,
      expect.anything(),
    );
    expect(screen.queryByTestId("oli-robot-head")).not.toBeInTheDocument();
  });

  it("shows Oli's blue head and the combined status while Oli helps", () => {
    render(
      <TypingIndicator
        events={[taskAction("1", "oli")]}
        model={RECOMMENDED_DEEPSEEK_MODEL}
      />,
    );

    expect(screen.getByTestId("oli-robot-head")).toHaveAttribute(
      "data-oli-status",
      "thinking",
    );
    // Both heads are visible together.
    expect(screen.getByTestId("thinking-orb")).toBeInTheDocument();
    expect(screen.getByTestId("live-activity-chip")).toHaveTextContent(
      I18nKey.THINKING$OLI_AND_MODEL,
    );
    expect(t).toHaveBeenCalledWith(I18nKey.THINKING$OLI_AND_MODEL, {
      model: "DeepSeek V4.1 Flash",
    });
  });

  it("names the agent when Oli helps a non-DeepSeek model", () => {
    render(
      <TypingIndicator
        events={[taskAction("1", "oli")]}
        model="openai/gpt-5.6-sol"
      />,
    );

    expect(screen.getByTestId("live-activity-chip")).toHaveTextContent(
      I18nKey.THINKING$OLI_AND_AGENT,
    );
  });

  it("drops the Oli head once the delegation resolves", () => {
    const delegation = taskAction("1", "oli");

    render(
      <TypingIndicator
        events={[delegation, taskObservation("2", delegation)]}
        model={RECOMMENDED_DEEPSEEK_MODEL}
      />,
    );

    expect(screen.queryByTestId("oli-robot-head")).not.toBeInTheDocument();
    expect(screen.getByTestId("live-activity-chip")).toHaveTextContent(
      I18nKey.ACTION_MESSAGE$MODEL_THINKING,
    );
  });

  it("keeps the combined status while Oli's own step is the live action", () => {
    render(
      <TypingIndicator
        events={[
          taskAction("1", "oli"),
          makeActionEvent("2", {
            kind: "TerminalAction",
            command: "npm test",
            is_input: false,
            timeout: null,
            reset: false,
          }),
        ]}
        model={RECOMMENDED_DEEPSEEK_MODEL}
      />,
    );

    expect(screen.getByTestId("oli-robot-head")).toBeInTheDocument();
    expect(screen.getByTestId("live-activity-chip")).toHaveTextContent(
      I18nKey.THINKING$OLI_AND_MODEL,
    );
  });
});
