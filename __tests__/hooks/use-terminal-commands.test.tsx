import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTerminalCommands } from "#/hooks/use-terminal-commands";

const runCommand = vi.fn();
let activeId = "conversation-1";

vi.mock("#/hooks/query/use-active-conversation", () => ({
  useActiveConversation: () => ({
    data: {
      id: activeId,
      conversation_url:
        "http://localhost:8001/api/conversations/conversation-1",
      session_api_key: "session-key",
      workspace: { working_dir: "/workspace/project" },
    },
  }),
}));

vi.mock("#/hooks/use-runtime-is-ready", () => ({
  useRuntimeIsReady: () => true,
}));

vi.mock("#/hooks/use-bash-command-runner", () => ({
  useBashCommandRunner: () => runCommand,
}));

describe("useTerminalCommands", () => {
  beforeEach(() => {
    runCommand.mockReset();
    activeId = "conversation-1";
    window.sessionStorage.clear();
  });

  it("appends the typed command and its output to the transcript", async () => {
    runCommand.mockResolvedValue({
      exit_code: 0,
      stdout: "typed output",
      stderr: "",
    });

    const { result } = renderHook(() => useTerminalCommands());

    act(() => result.current.run("echo hi"));

    await waitFor(() => expect(result.current.isRunning).toBe(false));

    expect(runCommand).toHaveBeenCalledWith(
      "echo hi",
      "/workspace/project",
      expect.any(Number),
    );
    expect(result.current.commands).toEqual([
      { content: "echo hi", type: "input" },
      { content: "typed output", type: "output" },
    ]);
  });

  it("shows the command as running until it finishes", async () => {
    let resolveCommand: (value: unknown) => void = () => {};
    runCommand.mockReturnValue(
      new Promise((resolve) => {
        resolveCommand = resolve;
      }),
    );

    const { result } = renderHook(() => useTerminalCommands());

    act(() => result.current.run("sleep 5"));

    // The command is echoed immediately and flagged as running rather than
    // appearing ignored while it executes.
    expect(result.current.isRunning).toBe(true);
    expect(result.current.commands).toEqual([
      { content: "sleep 5", type: "input" },
    ]);

    await act(async () => {
      resolveCommand({ exit_code: 0, stdout: "done", stderr: "" });
    });

    expect(result.current.isRunning).toBe(false);
    expect(result.current.commands).toEqual([
      { content: "sleep 5", type: "input" },
      { content: "done", type: "output" },
    ]);
  });

  it("surfaces a failure instead of dropping it", async () => {
    runCommand.mockRejectedValue(new Error("backend unreachable"));

    const { result } = renderHook(() => useTerminalCommands());

    act(() => result.current.run("echo hi"));

    await waitFor(() =>
      expect(result.current.commands.at(-1)).toEqual({
        content: "backend unreachable",
        type: "error",
      }),
    );
  });

  it("ignores an empty command", () => {
    const { result } = renderHook(() => useTerminalCommands());

    act(() => result.current.run("   "));

    expect(runCommand).not.toHaveBeenCalled();
    expect(result.current.commands).toEqual([]);
  });

  it("restores typed commands from session storage on mount", () => {
    window.sessionStorage.setItem(
      "agent-canvas:terminal-commands:conversation-1",
      JSON.stringify([
        { content: "echo persisted", type: "input" },
        { content: "persisted", type: "output" },
      ]),
    );

    const { result } = renderHook(() => useTerminalCommands());

    expect(result.current.commands).toEqual([
      { content: "echo persisted", type: "input" },
      { content: "persisted", type: "output" },
    ]);
  });
  // @spec TERMINAL-ERROR-1 — nonzero exits are failures, not still-running commands
  it("reports a nonzero exit as an error with its exit code", async () => {
    runCommand.mockResolvedValue({
      exit_code: 7,
      stdout: "",
      stderr: "build failed",
    });
    const { result } = renderHook(() => useTerminalCommands());
    act(() => result.current.run("npm run build"));
    await waitFor(() => expect(result.current.isRunning).toBe(false));
    expect(result.current.commands[1]).toEqual({
      content: "build failed",
      type: "error",
      exitCode: 7,
    });
  });

  it("labels transport failures as errors and allows retry", async () => {
    runCommand
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ exit_code: 0, stdout: "ok", stderr: "" });
    const { result } = renderHook(() => useTerminalCommands());
    act(() => result.current.run("pwd"));
    await waitFor(() => expect(result.current.isRunning).toBe(false));
    expect(result.current.commands[1]).toEqual({
      content: "offline",
      type: "error",
    });
    expect(result.current.canRun).toBe(true);
    act(() => result.current.run("pwd"));
    await waitFor(() => expect(result.current.commands).toHaveLength(4));
  });

  it("does not leak a switched command into the next transcript or unlock its successor", async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    runCommand.mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const { result, rerender } = renderHook(() => useTerminalCommands());
    act(() => result.current.run("echo first"));
    activeId = "conversation-2";
    rerender();
    await waitFor(() => expect(result.current.commands).toEqual([]));
    act(() => result.current.run("echo second"));
    await act(async () =>
      resolvers[0]({ exit_code: 0, stdout: "first output", stderr: "" }),
    );
    expect(result.current.isRunning).toBe(true);
    expect(result.current.commands).toEqual([
      { content: "echo second", type: "input" },
    ]);
    await act(async () =>
      resolvers[1]({ exit_code: 0, stdout: "second output", stderr: "" }),
    );
    expect(result.current.isRunning).toBe(false);
    expect(
      JSON.parse(
        sessionStorage.getItem(
          "agent-canvas:terminal-commands:conversation-2",
        ) ?? "[]",
      ),
    ).toEqual([
      { content: "echo second", type: "input" },
      { content: "second output", type: "output" },
    ]);
  });
});
