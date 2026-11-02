import type { OHEvent } from "#/stores/use-event-store";
import {
  isExecuteBashActionEvent,
  isExecuteBashObservationEvent,
} from "#/types/agent-server/type-guards";

export type TerminalCommandType = "input" | "output" | "running" | "error";

export interface TerminalCommand {
  content: string;
  type: TerminalCommandType;
  exitCode?: number;
}

/**
 * A command the agent started but that has not finished yet. The terminal tool
 * reports a soft timeout with `exit_code === -1` and/or `timeout === true`; the
 * same command yields a later observation once it completes.
 */
export const isStillRunning = (
  exitCode: number | null,
  timeout: boolean,
): boolean => exitCode === -1 || timeout;

const observationText = (event: OHEvent): string =>
  (
    event as {
      observation: { content: Array<{ type: string; text?: string }> };
    }
  ).observation.content
    .filter((content) => content.type === "text")
    .map((content) => content.text ?? "")
    .join("\n");

/**
 * Derive the terminal transcript from the shared event log.
 *
 * The transcript is a pure function of the events already in the store, so the
 * tab renders identically whether events arrived live over the WebSocket or
 * were rebuilt from REST-preloaded history after a reload — there is no
 * separate command store that has to be hydrated (and that used to start empty).
 */
export const deriveTerminalCommands = (
  events: OHEvent[],
): TerminalCommand[] => {
  const commands: TerminalCommand[] = [];

  for (const event of events) {
    if (isExecuteBashActionEvent(event)) {
      commands.push({ content: event.action.command, type: "input" });
      continue;
    }
    if (!isExecuteBashObservationEvent(event)) {
      continue;
    }

    const { observation } = event;
    commands.push({
      content: observationText(event),
      type: isStillRunning(observation.exit_code, observation.timeout)
        ? "running"
        : "output",
    });
  }

  return commands;
};
