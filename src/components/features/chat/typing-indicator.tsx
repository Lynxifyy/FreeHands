import { Trans, useTranslation } from "react-i18next";
import type { OHEvent } from "#/stores/use-event-store";
import { I18nKey } from "#/i18n/declaration";
import {
  isACPToolCallEvent,
  isActionEvent,
  isAgentErrorEvent,
  isObservationEvent,
  isUserRejectObservation,
} from "#/types/agent-server/type-guards";
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

const getLiveActionTitle = (event: OHEvent): EventTitleDescriptor | null => {
  if (!isActionEvent(event)) return null;

  const summary = getActionSummaryTitle(event);
  if (summary) {
    return { kind: "text", text: summary };
  }

  return LIVE_ACTION_KINDS.has(event.action.kind)
    ? getActionEventTitleDescriptor(event)
    : null;
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
  const oliStatus = deriveOliStatus(events);
  const modelLabel = thinkingModelLabel(model);

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
  }

  return (
    <div
      className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-text-secondary"
      data-testid="live-activity-chip"
      data-oli-active={oliStatus ?? "false"}
      role="status"
      aria-live="polite"
    >
      <ThinkingOrb size={16} className="mr-0.5" />
      {oliStatus && <OliRobotHead status={oliStatus} size={16} />}
      <span className="min-w-0 truncate">
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
    </div>
  );
}
