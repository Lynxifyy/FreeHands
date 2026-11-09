import { describe, expect, it } from "vitest";

import { uiPreviewPathFromEvent } from "#/services/ui-preview/auto-preview";
import type { OHEvent } from "#/stores/use-event-store";

function makeEvent(observation: Record<string, unknown>): OHEvent {
  return {
    id: "1",
    timestamp: "2026-01-01T00:00:00.000Z",
    source: "environment",
    tool_name: "str_replace_based_edit_tool",
    tool_call_id: "tc-1",
    action_id: "act-1",
    observation,
  } as unknown as OHEvent;
}

describe("uiPreviewPathFromEvent", () => {
  it.each([
    ["index.html", null],
    ["src/App.tsx.html", null],
    ["assets/logo.svg", null],
    ["res/layout/activity_main.xml", null],
    ["README.md", null],
  ])("returns the path when a file editor writes %s", (path, newContent) => {
    const event = makeEvent({
      kind: "FileEditorObservation",
      command: "create",
      path,
      new_content: newContent,
    });

    expect(uiPreviewPathFromEvent(event)).toBe(path);
  });

  it("treats a Compose Kotlin write as UI", () => {
    const event = makeEvent({
      kind: "FileEditorObservation",
      command: "create",
      path: "src/MainActivity.kt",
      new_content: "class MainActivity { fun onCreate() { setContent { Text(\"hi\") } } }",
    });

    expect(uiPreviewPathFromEvent(event)).toBe("src/MainActivity.kt");
  });

  it.each([
    [
      "a plain (non-Compose) Kotlin file",
      {
        kind: "FileEditorObservation",
        command: "create",
        path: "src/Utils.kt",
        new_content: "fun add(a: Int, b: Int) = a + b",
      },
    ],
    [
      "a file the agent only viewed",
      {
        kind: "FileEditorObservation",
        command: "view",
        path: "index.html",
        new_content: null,
      },
    ],
    [
      "a non-UI source file",
      {
        kind: "FileEditorObservation",
        command: "create",
        path: "src/main.py",
        new_content: "print('hi')",
      },
    ],
    [
      "a bash observation",
      {
        kind: "ExecuteBashObservation",
        command: "ls",
        path: null,
      },
    ],
    [
      "an observation with no path",
      {
        kind: "FileEditorObservation",
        command: "create",
        path: null,
      },
    ],
  ])("returns null for %s", (_label, observation) => {
    expect(uiPreviewPathFromEvent(makeEvent(observation))).toBeNull();
  });
});
