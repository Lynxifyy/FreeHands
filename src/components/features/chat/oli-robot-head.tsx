import { cn } from "#/utils/utils";
import type { OliStatus } from "#/utils/oli-activity";

interface OliRobotHeadProps {
  /** What Oli is doing right now; drives the animation. */
  status: OliStatus;
  /** Diameter in pixels. */
  size?: number;
  className?: string;
  /**
   * Whether to animate. The live-activity chip leaves this on; static brand
   * marks (conversation chips, onboarding tiles, settings previews) turn it off
   * so a list of many rows does not all animate at once.
   */
  animate?: boolean;
  /** Root test id; defaults to ``oli-robot-head``. */
  testId?: string;
}

/**
 * Oli's mark: a blue robot head that animates while Oli is helping — a slow bob
 * while it reasons, a faster writing beat while it edits code. Purely
 * decorative (the live-activity chip carries the text), so it is `aria-hidden`.
 * Animations stop under `prefers-reduced-motion`.
 */
export function OliRobotHead({
  status,
  size = 16,
  className,
  animate = true,
  testId = "oli-robot-head",
}: OliRobotHeadProps) {
  const antenna = Math.max(2, Math.round(size * 0.14));
  const eye = Math.max(2, Math.round(size * 0.16));

  return (
    <span
      data-testid={testId}
      data-oli-status={status}
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 flex-col items-center",
        className,
      )}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <span
        data-testid="oli-robot-antenna"
        className={cn(
          "rounded-full bg-logo",
          animate && "animate-oli-antenna motion-reduce:animate-none",
        )}
        style={{ width: `${antenna}px`, height: `${antenna}px` }}
      />
      <span
        className={cn(
          "flex flex-1 items-center justify-center gap-[15%] rounded-md bg-logo",
          "shadow-[0_0_0_1px_rgba(96,165,250,0.35),0_0_6px_rgba(59,130,246,0.55)]",
          animate &&
            (status === "coding"
              ? "animate-oli-code motion-reduce:animate-none"
              : "animate-oli-think motion-reduce:animate-none"),
        )}
        style={{ width: `${size}px` }}
      >
        <span
          data-testid="oli-robot-eye"
          className="block rounded-full bg-canvas-base"
          style={{ width: `${eye}px`, height: `${eye}px` }}
        />
        <span
          data-testid="oli-robot-eye"
          className="block rounded-full bg-canvas-base"
          style={{ width: `${eye}px`, height: `${eye}px` }}
        />
      </span>
    </span>
  );
}
