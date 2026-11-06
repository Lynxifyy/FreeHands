import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { codeCritiqueVisualizer } from "#/components/features/chat/tool-visualizers/code-critique/code-critique";
import type { CodeCritiqueAction } from "#/types/agent-server/core";
import { renderVisualizer } from "../test-utils";

const Body = codeCritiqueVisualizer.Body;

function actionEvent(
  action: Partial<CodeCritiqueAction>,
  observation?: unknown,
) {
  return {
    id: "cc-1",
    timestamp: "2024-01-01T00:00:00Z",
    source: "agent" as const,
    thought: [],
    thinking_blocks: [],
    tool_name: "code_critique",
    tool_call_id: "call_cc",
    llm_response_id: "resp_cc",
    action: { kind: "ClientAction_code_critique", ...action },
    ...(observation === undefined ? {} : { observation }),
  } as never;
}

describe("codeCritiqueVisualizer", () => {
  it("shows the reviewed path before a result arrives", () => {
    renderVisualizer(<Body action={actionEvent({ path: "app/index.html" })} />);

    expect(screen.getByText("CODE_CRITIQUE$REVIEWING")).toBeInTheDocument();
    expect(screen.getByText("app/index.html")).toBeInTheDocument();
  });

  it("renders the verdict and each issue when a result is present", () => {
    renderVisualizer(
      <Body
        action={actionEvent(
          { path: "app/index.html" },
          {
            verdict: "fail",
            summary:
              "Found 1 issue, including at least one error that will not work.",
            language: "html",
            issues: [
              {
                rule: "html/unclosed-tag",
                severity: "error",
                category: "structure",
                message: "<div> is never closed.",
                line: 1,
                hint: "Add the matching </div>.",
              },
            ],
          },
        )}
      />,
    );

    expect(screen.getByText("CODE_CRITIQUE$VERDICT_FAIL")).toBeInTheDocument();
    expect(
      screen.getByText("CODE_CRITIQUE$SEVERITY_ERROR"),
    ).toBeInTheDocument();
    expect(screen.getByText("<div> is never closed.")).toBeInTheDocument();
    expect(screen.getByText("html/unclosed-tag")).toBeInTheDocument();
  });

  it("falls back to showing the inline snippet when there is no result", () => {
    renderVisualizer(
      <Body action={actionEvent({ code: "export const x = 1;" })} />,
    );

    expect(screen.getByText("export const x = 1;")).toBeInTheDocument();
  });
});
