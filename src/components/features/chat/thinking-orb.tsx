import { cn } from "#/utils/utils";

interface ThinkingOrbProps {
  /** Diameter in pixels. */
  size?: number;
  className?: string;
}

/**
 * The FreeHands "thinking" mark: a white circle with two smooth animated eyes.
 *
 * Purely decorative (the live-activity chip carries the text), so it is
 * `aria-hidden`. The eyes are CSS-animated (`thinking-orb-blink` /
 * `thinking-orb-look`) and stop under `prefers-reduced-motion`.
 */
export function ThinkingOrb({ size = 18, className }: ThinkingOrbProps) {
  const eye = Math.max(2, Math.round(size * 0.17));
  const gap = Math.max(2, Math.round(size * 0.18));

  return (
    <span
      data-testid="thinking-orb"
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        "rounded-full bg-white",
        "shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.25)]",
        className,
      )}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <span
        data-testid="thinking-orb-eyes"
        className="flex items-center justify-center animate-thinking-look motion-reduce:animate-none"
        style={{ gap: `${gap}px` }}
      >
        <span
          data-testid="thinking-orb-eye"
          className={cn(
            "block rounded-full bg-canvas-base",
            "animate-thinking-blink motion-reduce:animate-none",
          )}
          style={{ width: `${eye}px`, height: `${eye}px` }}
        />
        <span
          data-testid="thinking-orb-eye"
          className={cn(
            "block rounded-full bg-canvas-base",
            "animate-thinking-blink motion-reduce:animate-none",
          )}
          style={{ width: `${eye}px`, height: `${eye}px` }}
        />
      </span>
    </span>
  );
}
