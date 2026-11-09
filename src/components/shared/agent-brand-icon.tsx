import TerminalIcon from "#/icons/terminal.svg?react";
import { OliRobotHead } from "#/components/features/chat/oli-robot-head";
import {
  CLAUDE_CODE_MARK_PATH,
  CLAUDE_CODE_VIEWBOX,
  CODEX_MARK_PATH,
  CODEX_VIEWBOX,
  GEMINI_MARK_PATH,
  GEMINI_VIEWBOX,
  OPENCODE_MARK_INNER_PATH,
  OPENCODE_MARK_OUTER_PATH,
  OPENCODE_VIEWBOX,
  PI_MARK_PATH,
  PI_VIEWBOX,
} from "#/constants/acp-brand-marks";
import type { ACPProviderIcon } from "#/constants/acp-providers";
import { cn } from "#/utils/utils";

/**
 * Icons the conversation chip + onboarding tiles can render. Strictly broader
 * than {@link ACPProviderIcon} — that type covers ACP CLI subprocesses only
 * (plus the generic terminal fallback), whereas this type additionally includes
 * the native OpenHands harness, which FreeHands brands as "Oli".
 */
export type AgentBrandIconKind = "openhands" | ACPProviderIcon;

interface AgentBrandIconProps {
  kind: AgentBrandIconKind;
  size?: number;
  className?: string;
  "data-testid"?: string;
}

export function AgentBrandIcon({
  kind,
  size = 12,
  className,
  "data-testid": testId,
}: AgentBrandIconProps) {
  if (kind === "openhands") {
    // FreeHands brands the native harness as "Oli", so the chip, onboarding
    // tile and preview show Oli's static blue robot head rather than the
    // OpenHands wordmark. Static (no animation) so a list of many rows does not
    // all animate; the live-activity chip keeps its own animated head.
    return (
      <OliRobotHead
        status="thinking"
        size={size}
        animate={false}
        className={className}
        testId={testId ?? "agent-brand-icon-openhands"}
      />
    );
  }
  if (kind === "claude-code") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={CLAUDE_CODE_VIEWBOX}
        width={size}
        height={size}
        className={cn("shrink-0", className)}
        data-testid={testId ?? "agent-brand-icon-claude-code"}
        aria-hidden
      >
        <path fill="currentColor" d={CLAUDE_CODE_MARK_PATH} />
      </svg>
    );
  }
  if (kind === "codex") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={CODEX_VIEWBOX}
        width={size}
        height={size}
        className={cn("shrink-0", className)}
        data-testid={testId ?? "agent-brand-icon-codex"}
        aria-hidden
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d={CODEX_MARK_PATH}
          fill="currentColor"
        />
      </svg>
    );
  }
  if (kind === "gemini") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={GEMINI_VIEWBOX}
        width={size}
        height={size}
        className={cn("shrink-0", className)}
        data-testid={testId ?? "agent-brand-icon-gemini"}
        aria-hidden
      >
        <path fill="currentColor" d={GEMINI_MARK_PATH} />
      </svg>
    );
  }
  if (kind === "pi") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={PI_VIEWBOX}
        width={size}
        height={size}
        className={cn("shrink-0", className)}
        data-testid={testId ?? "agent-brand-icon-pi"}
        aria-hidden
      >
        <path fill="currentColor" d={PI_MARK_PATH} />
      </svg>
    );
  }
  if (kind === "opencode") {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={OPENCODE_VIEWBOX}
        width={size}
        height={size}
        className={cn("shrink-0", className)}
        data-testid={testId ?? "agent-brand-icon-opencode"}
        aria-hidden
      >
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d={OPENCODE_MARK_OUTER_PATH}
          fill="currentColor"
        />
        <path d={OPENCODE_MARK_INNER_PATH} fill="currentColor" opacity="0.35" />
      </svg>
    );
  }
  return (
    <TerminalIcon
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      data-testid={testId ?? "agent-brand-icon-generic"}
      aria-hidden
    />
  );
}
