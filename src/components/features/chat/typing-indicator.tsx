import { Trans, useTranslation } from "react-i18next";
import type { OHEvent } from "#/stores/use-event-store";
import { I18nKey } from "#/i18n/declaration";
import {
  isACPToolCallEvent,
  isActionEvent,
  isAgentErrorEvent,
  isMessageEvent,
  isObservationEvent,
  isUserRejectObservation,
} from "#/types/agent-server/type-guards";
import { parseMessageFromEvent } from "#/components/conversation-events/chat/event-content-helpers/parse-message-from-event";
import {
  getACPToolCallTitleKey,
  stripRedundantTitlePrefix,
} from "#/components/conversation-events/chat/event-content-helpers/get-acp-tool-call-content";
import {
  getActionEventTitleDescriptor,
  getActionSummaryTitle,
  type EventTitleDescriptor,
} from "#/components/conversation-events/chat/event-content-helpers/get-action-event-title";
import { thinkingModelLabel } from "#/utils/format-model-name";
import { deriveOliStatus } from "#/utils/oli-activity";
import { MonoComponent } from "./mono-component";
import { PathComponent } from "./path-component";
import { ThinkingOrb } from "./thinking-orb";
import { OliRobotHead } from "./oli-robot-head";

const THINKING_ACTIVITY: EventTitleDescriptor = {
  kind: "translation",
  key: "ACTION_MESSAGE$THINK",
  values: {},
};

const LIVE_ACTION_KINDS = new Set([
  "ExecuteBashAction",
  "TerminalAction",
  "FileEditorAction",
  "StrReplaceEditorAction",
  "MCPToolAction",
  "InvokeSkillAction",
  "TaskAction",
  "ThinkAction",
  "TaskTrackerAction",
  "GrepAction",
  "GlobAction",
  "BrowserNavigateAction",
  "BrowserClickAction",
  "BrowserTypeAction",
  "BrowserGetStateAction",
  "BrowserGetContentAction",
  "BrowserScrollAction",
  "BrowserGoBackAction",
  "BrowserListTabsAction",
  "BrowserSwitchTabAction",
  "BrowserCloseTabAction",
]);

/**
 * Command-shaped shell work is the bulk of a long session. Naming the phase
 * ("Running tests", "Building the project") is more useful than echoing the
 * whole command, which the second line still shows verbatim.
 */
const COMMAND_PHASES: ReadonlyArray<{ pattern: RegExp; key: string }> = [
  {
    pattern:
      /\b(test|pytest|jest|vitest|mocha|phpunit|rspec|go test|cargo test|ctest)\b/i,
    key: "ACTION_MESSAGE$RUN_TESTS",
  },
  {
    pattern:
      /\b(lint|eslint|prettier|ruff|clippy|checkstyle|flake8|tsc --noEmit)\b/i,
    key: "ACTION_MESSAGE$RUN_LINT",
  },
  {
    pattern:
      /\b(build|compile|webpack|vite build|next build|cargo build|go build|make)\b/i,
    key: "ACTION_MESSAGE$RUN_BUILD",
  },
  {
    pattern:
      /\b(npm (install|i|ci)|pnpm (install|i|add)|yarn( install| add)?|pip install|poetry install|uv (sync|pip install)|cargo fetch|bundle install|composer install|apt(-get)? install|brew install)\b/i,
    key: "ACTION_MESSAGE$INSTALL_DEPS",
  },
  { pattern: /\bgit\b/i, key: "ACTION_MESSAGE$GIT_OP" },
  {
    pattern:
      /\b(npm (run )?dev|vite|next dev|uvicorn|flask run|http\.server|serve|docker (run|compose up))\b/i,
    key: "ACTION_MESSAGE$SERVE",
  },
];

const describeCommandPhase = (command: string): EventTitleDescriptor | null => {
  const phase = COMMAND_PHASES.find(({ pattern }) => pattern.test(command));
  return phase ? { kind: "translation", key: phase.key, values: {} } : null;
};

const getLiveActionTitle = (event: OHEvent): EventTitleDescriptor | null => {
  if (!isActionEvent(event)) return null;

  const summary = getActionSummaryTitle(event);
  if (summary) {
    return { kind: "text", text: summary };
  }

  if (
    event.action.kind === "ExecuteBashAction" ||
    event.action.kind === "TerminalAction"
  ) {
    const phase = describeCommandPhase(event.action.command);
    if (phase) return phase;
  }

  return LIVE_ACTION_KINDS.has(event.action.kind)
    ? getActionEventTitleDescriptor(event)
    : null;
};

const THINKING_SUBJECT_MAX = 72;

const shortenSubject = (text: string): string => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > THINKING_SUBJECT_MAX
    ? `${line.slice(0, THINKING_SUBJECT_MAX)}…`
    : line;
};

/**
 * The newest thought the agent is actually working from, so a bare "Thinking"
 * becomes "Thinking about: <subject>". Falls back to the latest assistant
 * message when the model did not emit a `ThinkAction`.
 */
export const deriveThinkingSubject = (
  events: readonly OHEvent[],
): string | null => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.isFromPlanningAgent) continue;

    if (isActionEvent(event)) {
      if (
        event.action.kind === "ThinkAction" &&
        typeof event.action.thought === "string"
      ) {
        const thought = shortenSubject(event.action.thought);
        if (thought) return thought;
      }
      // Any other action is newer than older prose; do not resurface a stale
      // assistant paragraph as the current thought.
      return null;
    }

    if (isMessageEvent(event) && event.llm_message.role === "assistant") {
      const text = shortenSubject(parseMessageFromEvent(event));
      if (text) return text;
    }
  }

  return null;
};

export const deriveLiveActivity = (
  events: readonly OHEvent[],
): EventTitleDescriptor => {
  const resolvedActionIds = new Set<string>();
  const resolvedToolCallIds = new Set<string>();

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

    if (isACPToolCallEvent(event)) {
      const isInProgress =
        event.status === "pending" || event.status === "in_progress";
      if (!isInProgress) {
        resolvedToolCallIds.add(event.tool_call_id);
        continue;
      }
      if (resolvedToolCallIds.has(event.tool_call_id)) {
        continue;
      }

      const title = stripRedundantTitlePrefix(event);
      return title
        ? {
            kind: "translation",
            key: getACPToolCallTitleKey(event),
            values: { title },
          }
        : THINKING_ACTIVITY;
    }

    if (
      isActionEvent(event) &&
      !resolvedActionIds.has(event.id) &&
      !resolvedToolCallIds.has(event.tool_call_id)
    ) {
      return getLiveActionTitle(event) ?? THINKING_ACTIVITY;
    }
  }

  return THINKING_ACTIVITY;
};

/**
 * The command the agent is running right now, for the semi-transparent second
 * line under the thinking status. Returns `null` when the live action is not a
 * shell command (or has already been answered by an observation).
 */
export const deriveRunningCommand = (
  events: readonly OHEvent[],
): string | null => {
  const resolvedActionIds = new Set<string>();
  const resolvedToolCallIds = new Set<string>();

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

    if (isACPToolCallEvent(event)) {
      if (event.status !== "pending" && event.status !== "in_progress") {
        resolvedToolCallIds.add(event.tool_call_id);
      }
      continue;
    }

    if (
      isActionEvent(event) &&
      !resolvedActionIds.has(event.id) &&
      !resolvedToolCallIds.has(event.tool_call_id)
    ) {
      const { action } = event;
      return action.kind === "ExecuteBashAction" ||
        action.kind === "TerminalAction"
        ? action.command
        : null;
    }
  }

  return null;
};

interface TypingIndicatorProps {
  readonly events: readonly OHEvent[];
  /**
   * Routing id of the active model, used for the model-aware status. Absent on
   * the home page, where the chip still falls back to the generic "Thinking".
   */
  readonly model?: string | null;
}

/**
 * Key `deriveLiveActivity` returns for a plain "agent is thinking" state (no
 * concrete action in flight). Used to decide when the status should name the
 * model instead of a bare "Thinking".
 */
const THINKING_KEY = "ACTION_MESSAGE$THINK";

export function TypingIndicator({ events, model }: TypingIndicatorProps) {
  const { t } = useTranslation("openhands");
  const activity = deriveLiveActivity(events);
  const runningCommand = deriveRunningCommand(events);
  const oliStatus = deriveOliStatus(events);
  const modelLabel = thinkingModelLabel(model);
  const thinkingSubject =
    activity.kind === "translation" && activity.key === THINKING_KEY
      ? deriveThinkingSubject(events)
      : null;

  // While Oli is helping, the delegation itself is the live activity, so its
  // generic task title is replaced by the combined status.
  let text: string | null = null;
  if (oliStatus) {
    text = modelLabel
      ? t(I18nKey.THINKING$OLI_AND_MODEL, { model: modelLabel })
      : t(I18nKey.THINKING$OLI_AND_AGENT);
  } else if (
    activity.kind === "translation" &&
    activity.key === THINKING_KEY &&
    modelLabel
  ) {
    text = t(I18nKey.ACTION_MESSAGE$MODEL_THINKING, { model: modelLabel });
  } else if (thinkingSubject) {
    text = t(I18nKey.THINKING$ABOUT, { subject: thinkingSubject });
  }

  return (
    <div
      className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-text-secondary"
      data-testid="live-activity-chip"
      data-oli-active={oliStatus ?? "false"}
      role="status"
      aria-live="polite"
    >
      <ThinkingOrb size={13} className="mr-0.5" />
      {oliStatus && <OliRobotHead status={oliStatus} size={13} />}
      <span className="flex min-w-0 flex-col">
        <span className="glimmer min-w-0 truncate">
          {text ??
            (activity.kind === "text" ? (
              activity.text
            ) : (
              <Trans
                ns="openhands"
                i18nKey={activity.key}
                values={activity.values}
                components={{
                  path: <PathComponent />,
                  cmd: <MonoComponent />,
                }}
              />
            ))}
        </span>
        {runningCommand && (
          <span
            data-testid="live-activity-command"
            className="min-w-0 truncate font-mono text-[0.9em] text-text-secondary/50"
            title={runningCommand}
          >
            $ {runningCommand}
          </span>
        )}
      </span>
    </div>
  );
}
