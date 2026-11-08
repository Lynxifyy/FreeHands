import type { OHEvent } from "#/stores/use-event-store";
import {
  isActionEvent,
  isAgentErrorEvent,
  isObservationEvent,
  isUserRejectObservation,
} from "#/types/agent-server/type-guards";
import type { Action } from "#/types/agent-server/core/base/action";

/**
 * The SDK registers the "Oli" coding agent under this subagent type. Kept here
 * so the frontend can recognise a delegation to Oli without depending on the
 * agent's prompt or display name.
 */
export const OLI_SUBAGENT_TYPE = "oli";

/** Whether a `TaskAction.subagent_type` refers to the Oli coding agent. */
export function isOliSubagent(
  subagentType: string | null | undefined,
): boolean {
  if (!subagentType) return false;
  const normalized = subagentType.trim().toLowerCase();
  return (
    normalized === OLI_SUBAGENT_TYPE ||
    normalized.startsWith(`${OLI_SUBAGENT_TYPE}-`) ||
    normalized.startsWith(`${OLI_SUBAGENT_TYPE}_`)
  );
}

/** What Oli is doing: reasoning about a task, or writing code. */
export type OliStatus = "thinking" | "coding";

const CODE_WRITING_COMMANDS = new Set<string>([
  "create",
  "str_replace",
  "insert",
]);

const isCodeWritingAction = (action: Action): boolean =>
  (action.kind === "FileEditorAction" ||
    action.kind === "StrReplaceEditorAction") &&
  CODE_WRITING_COMMANDS.has(action.command);

/**
 * Live Oli activity for the thinking chip: `null` when Oli is not helping,
 * otherwise what Oli is doing right now.
 *
 * Oli is a subagent, so the parent's `TaskAction` stays unresolved for the
 * whole delegation; that unresolved action is the "Oli is helping" signal. Once
 * its `TaskObservation` arrives the parent resumes and the status clears.
 * While delegated, the newest unresolved action is Oli's own step — a file
 * write reads as "coding", anything else as "thinking".
 */
export function deriveOliStatus(events: readonly OHEvent[]): OliStatus | null {
  const resolvedActionIds = new Set<string>();
  const resolvedToolCallIds = new Set<string>();
  let oliDelegated = false;
  let latestUnresolvedAction: Action | null = null;

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.isFromPlanningAgent) {
      continue;
    }

    if (isObservationEvent(event) || isUserRejectObservation(event)) {
      resolvedActionIds.add(event.action_id);
      resolvedToolCallIds.add(event.tool_call_id);
      continue;
    }

    if (isAgentErrorEvent(event)) {
      resolvedToolCallIds.add(event.tool_call_id);
      continue;
    }

    if (
      isActionEvent(event) &&
      !resolvedActionIds.has(event.id) &&
      !resolvedToolCallIds.has(event.tool_call_id)
    ) {
      if (
        event.action.kind === "TaskAction" &&
        isOliSubagent(event.action.subagent_type)
      ) {
        oliDelegated = true;
      }
      latestUnresolvedAction ??= event.action;
    }
  }

  if (!oliDelegated) return null;
  return latestUnresolvedAction && isCodeWritingAction(latestUnresolvedAction)
    ? "coding"
    : "thinking";
}
