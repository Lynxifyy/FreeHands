import { useCallback, useEffect, useRef, useState } from "react";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useBashCommandRunner } from "#/hooks/use-bash-command-runner";
import { useRuntimeIsReady } from "#/hooks/use-runtime-is-ready";
import type { TerminalCommand } from "#/utils/terminal-events";

/**
 * Default wall-clock budget for a command typed into the terminal tab.
 * The agent's own terminal tool can pick a longer timeout per call; a person
 * waiting on the tab cannot, so this stays well below the server default.
 */
const USER_COMMAND_TIMEOUT_SECONDS = 60;

const STORAGE_PREFIX = "agent-canvas:terminal-commands:";

/**
 * Commands a person typed into the terminal tab, kept per conversation.
 *
 * The agent's commands are derived from the event log, but a command typed
 * here runs through the bash API, which deliberately does not add to the event
 * stream (the agent must not see it). So the tab keeps its own list, persisted
 * in sessionStorage so a reload does not silently drop it.
 */
function loadCommands(conversationId: string | null): TerminalCommand[] {
  if (!conversationId || typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + conversationId);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TerminalCommand[]) : [];
  } catch {
    return [];
  }
}

function saveCommands(
  conversationId: string | null,
  commands: TerminalCommand[],
): void {
  if (!conversationId || typeof window === "undefined") return;
  try {
    if (commands.length === 0) {
      window.sessionStorage.removeItem(STORAGE_PREFIX + conversationId);
      return;
    }
    window.sessionStorage.setItem(
      STORAGE_PREFIX + conversationId,
      JSON.stringify(commands),
    );
  } catch {
    // Storage can be unavailable (private mode, quota); the transcript still
    // renders for this session, it just does not survive a reload.
  }
}

export interface TerminalCommandsController {
  /** Commands typed into the tab, oldest first. */
  commands: TerminalCommand[];
  /** Run `command` and append its output. No-op while one is in flight. */
  run: (command: string) => void;
  /** True while a typed command is executing. */
  isRunning: boolean;
  /** True when the runtime can accept a command. */
  canRun: boolean;
}

export function useTerminalCommands(): TerminalCommandsController {
  const { data: conversation } = useActiveConversation();
  const runtimeIsReady = useRuntimeIsReady();
  const conversationId = conversation?.id ?? null;
  const conversationUrl = conversation?.conversation_url;
  const sessionApiKey = conversation?.session_api_key;
  const workingDir = conversation?.workspace?.working_dir?.trim();

  const [commands, setCommands] = useState<TerminalCommand[]>(() =>
    loadCommands(conversationId),
  );
  const [loadedId, setLoadedId] = useState(conversationId);
  const [isRunning, setIsRunning] = useState(false);
  const activeConversationRef = useRef(conversationId);
  activeConversationRef.current = conversationId;
  const runGenerationRef = useRef(0);

  // Reload the stored transcript when the user switches conversation, rather
  // than carrying the previous conversation's commands across.
  const loadedFor = useRef(conversationId);
  useEffect(() => {
    if (loadedFor.current === conversationId) return;
    loadedFor.current = conversationId;
    activeConversationRef.current = conversationId;
    runGenerationRef.current += 1;
    setCommands(loadCommands(conversationId));
    setLoadedId(conversationId);
    setIsRunning(false);
  }, [conversationId]);

  useEffect(() => {
    if (loadedId === conversationId) saveCommands(conversationId, commands);
  }, [conversationId, commands, loadedId]);

  const canRun =
    runtimeIsReady &&
    loadedId === conversationId &&
    !!conversationId &&
    !!workingDir &&
    !isRunning;

  const runCommand = useBashCommandRunner(
    conversationUrl,
    sessionApiKey,
    canRun,
    conversationId ?? undefined,
  );

  const run = useCallback(
    (rawCommand: string) => {
      const command = rawCommand.trim();
      if (!command || !canRun || !workingDir) return;

      const owner = conversationId;
      const generation = runGenerationRef.current;
      setIsRunning(true);
      // Echo the command immediately so the tab acknowledges the submit; the
      // output is appended once the command finishes. The transcript is
      // append-only (xterm renders new lines), so the running state lives on
      // the submit button rather than a placeholder entry that a later update
      // could never replace.
      setCommands((previous) => [
        ...previous,
        { content: command, type: "input" },
      ]);

      runCommand(command, workingDir, USER_COMMAND_TIMEOUT_SECONDS)
        .then((result) => {
          if (
            activeConversationRef.current !== owner ||
            runGenerationRef.current !== generation
          )
            return;
          const text = [result.stdout, result.stderr]
            .filter((part) => part)
            .join("\n");
          setCommands((previous) => [
            ...previous,
            {
              content: text,
              type: result.exit_code === 0 ? "output" : "error",
              ...(result.exit_code !== 0 ? { exitCode: result.exit_code } : {}),
            },
          ]);
        })
        .catch((error: unknown) => {
          if (
            activeConversationRef.current !== owner ||
            runGenerationRef.current !== generation
          )
            return;
          const message =
            error instanceof Error ? error.message : String(error);
          setCommands((previous) => [
            ...previous,
            { content: message, type: "error" },
          ]);
        })
        .finally(() => {
          if (runGenerationRef.current === generation) setIsRunning(false);
        });
    },
    [canRun, workingDir, runCommand, conversationId],
  );

  return { commands, run, isRunning, canRun };
}
