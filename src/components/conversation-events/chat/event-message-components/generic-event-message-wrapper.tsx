import { useTranslation } from "react-i18next";
import {
  OpenHandsEvent,
  ActionEvent,
  ObservationEvent,
} from "#/types/agent-server/core";
import { InvokeSkillObservation } from "#/types/agent-server/core/base/observation";
import { I18nKey } from "#/i18n/declaration";
import { GenericEventMessage } from "../../../features/chat/generic-event-message";
import { getEventContent } from "../event-content-helpers/get-event-content";
import {
  getACPToolCallResult,
  getObservationResult,
  ObservationResultStatus,
} from "../event-content-helpers/get-observation-result";
import {
  isACPToolCallEvent,
  isActionEvent,
  isObservationEvent,
  isUserRejectObservation,
} from "#/types/agent-server/type-guards";
import {
  SkillReadyEvent,
  SkillReadyItem,
  isSkillReadyEvent,
} from "../event-content-helpers/create-skill-ready-event";
import { getInvokeSkillItems } from "../event-content-helpers/get-invoke-skill-items";
import { SkillReadyContentList } from "./skill-ready-content-list";
import SkillsIcon from "#/icons/skills.svg?react";
import { isMarkdownFileEditorEvent } from "#/components/features/chat/tool-visualizers/primitives/markdown-file-preview";
import { cn } from "#/utils/utils";

interface GenericEventMessageWrapperProps {
  event: OpenHandsEvent | SkillReadyEvent;
  isLastMessage: boolean;
  correspondingAction?: ActionEvent;
}

/**
 * Resolves the expandable skill-knowledge list shared by Skill Ready events and
 * invoke-skill tool observations. Returns the list items and their header
 * label, or null when the event carries no skill knowledge (so the caller keeps
 * the default details body). Additional skill-knowledge sources slot in as one
 * more branch here.
 */
function getSkillKnowledge(
  event: OpenHandsEvent | SkillReadyEvent,
): { items: SkillReadyItem[]; titleKey: I18nKey } | null {
  if (isSkillReadyEvent(event)) {
    return event._skillReadyItems.length > 0
      ? {
          items: event._skillReadyItems,
          titleKey: I18nKey.SKILLS$TRIGGERED_SKILL_KNOWLEDGE,
        }
      : null;
  }
  if (
    isObservationEvent(event) &&
    event.observation.kind === "InvokeSkillObservation"
  ) {
    const items = getInvokeSkillItems(
      event as ObservationEvent<InvokeSkillObservation>,
    );
    return items.length > 0
      ? { items, titleKey: I18nKey.SKILLS$INVOKED_SKILL_KNOWLEDGE }
      : null;
  }
  return null;
}

type EventPillStatus = "running" | "success" | "error" | "timeout";

function formatDuration(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function EventStatusPill({ status }: { status: EventPillStatus }) {
  const { t } = useTranslation("openhands");
  const label =
    status === "running"
      ? t(I18nKey.COMMON$WORKING)
      : status === "success"
        ? t(I18nKey.COMMON$FINISHED)
        : t(I18nKey.COMMON$ERROR);

  return (
    <span
      data-testid="event-status-pill"
      data-status={status}
      className={cn(
        "ml-2 inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5",
        "text-[10px] font-medium uppercase tracking-[0.06em] leading-4",
        "transition-colors duration-500",
        status === "running" &&
          "border-feedback-warning/30 bg-feedback-warning/10 text-feedback-warning",
        status === "success" &&
          "border-status-success/30 bg-status-success/10 text-status-success",
        (status === "error" || status === "timeout") &&
          "border-status-error/30 bg-status-error/10 text-status-error",
      )}
    >
      {status === "running" ? (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {label}
    </span>
  );
}

export function GenericEventMessageWrapper({
  event,
  isLastMessage,
  correspondingAction,
}: GenericEventMessageWrapperProps) {
  const { t } = useTranslation("openhands");
  const { title, details } = getEventContent(event, correspondingAction);

  // TaskTrackerObservation has its own rendering
  if (
    !isSkillReadyEvent(event) &&
    isObservationEvent(event) &&
    event.observation.kind === "TaskTrackerObservation"
  ) {
    return <div>{details}</div>;
  }

  // Determine success status
  let success: ObservationResultStatus | undefined;
  if (isSkillReadyEvent(event)) {
    success = "success";
  } else if (isObservationEvent(event)) {
    success = getObservationResult(event);
  } else if (isACPToolCallEvent(event)) {
    success = getACPToolCallResult(event);
  }

  // A live tool call gets a status pill and elapsed time, so a long-running
  // command reads as active and a completed one shows how long it took.
  let pillStatus: EventPillStatus | undefined;
  if (!isSkillReadyEvent(event) && isACPToolCallEvent(event)) {
    pillStatus =
      event.status === "pending" || event.status === "in_progress"
        ? "running"
        : event.status === "failed"
          ? "error"
          : "success";
  } else if (!isSkillReadyEvent(event) && isObservationEvent(event)) {
    pillStatus = success;
  } else if (
    !isSkillReadyEvent(event) &&
    isActionEvent(event) &&
    isLastMessage
  ) {
    pillStatus = "running";
  }
  const duration =
    !isSkillReadyEvent(event) && isObservationEvent(event)
      ? formatDuration(correspondingAction?.timestamp, event.timestamp)
      : null;

  // Skill Ready events and invoke-skill tool observations both render the
  // expandable skill-knowledge list (with the skills icon); they differ only in
  // the header label.
  const skillKnowledge = getSkillKnowledge(event);
  const bodyDetails = skillKnowledge ? (
    <SkillReadyContentList
      items={skillKnowledge.items}
      titleKey={skillKnowledge.titleKey}
    />
  ) : (
    details
  );

  // Markdown file-editor cards carry a clipped preview; expand them by
  // default so the artifact is visible without an extra chevron click.
  const initiallyExpanded =
    !isSkillReadyEvent(event) &&
    isMarkdownFileEditorEvent(event, correspondingAction);

  return (
    <div>
      <GenericEventMessage
        title={title}
        details={bodyDetails}
        success={success}
        initiallyExpanded={initiallyExpanded}
        timestamp={event.timestamp}
        titleTrailing={
          <>
            {duration ? (
              <span className="ml-2 shrink-0 font-mono text-[10px] text-muted">
                {duration}
              </span>
            ) : null}
            {pillStatus ? <EventStatusPill status={pillStatus} /> : null}
            {!isSkillReadyEvent(event) && isUserRejectObservation(event) ? (
              <span
                data-testid="rejected-indicator"
                className="ml-2 flex-shrink-0 text-danger"
              >
                {t(I18nKey.EVENT$REJECTED)}
              </span>
            ) : null}
          </>
        }
        titleIcon={
          skillKnowledge ? (
            <SkillsIcon className="h-4 w-4 stroke-muted flex-shrink-0 mr-2" />
          ) : undefined
        }
      />
    </div>
  );
}
