import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThinkingOrb } from "#/components/features/chat/thinking-orb";

describe("ThinkingOrb", () => {
  it("renders a white circle with two animated eyes", () => {
    render(<ThinkingOrb />);

    const orb = screen.getByTestId("thinking-orb");
    expect(orb).toBeInTheDocument();
    // A white disc: the base surface the eyes sit on.
    expect(orb.className).toContain("bg-white");
    expect(orb.className).toContain("rounded-full");
    expect(screen.getAllByTestId("thinking-orb-eye")).toHaveLength(2);
  });

  it("animates the eyes and settles when motion is reduced", () => {
    render(<ThinkingOrb />);

    const eye = screen.getAllByTestId("thinking-orb-eye")[0];
    // A CSS animation drives the blink/look-around; reduced motion disables it.
    expect(eye.className).toMatch(/animate-/);
    expect(eye.className).toContain("motion-reduce:animate-none");
  });

  it("marks itself as decorative for screen readers", () => {
    render(<ThinkingOrb />);
    expect(screen.getByTestId("thinking-orb")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("accepts a size override", () => {
    render(<ThinkingOrb size={24} />);
    const orb = screen.getByTestId("thinking-orb");
    expect(orb.style.width).toBe("24px");
    expect(orb.style.height).toBe("24px");
  });
});
