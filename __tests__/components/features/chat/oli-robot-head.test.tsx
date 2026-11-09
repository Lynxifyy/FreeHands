import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OliRobotHead } from "#/components/features/chat/oli-robot-head";

describe("OliRobotHead", () => {
  it("renders a blue robot head with an antenna and two eyes", () => {
    render(<OliRobotHead status="thinking" />);

    const head = screen.getByTestId("oli-robot-head");
    expect(head).toBeInTheDocument();
    expect(screen.getByTestId("oli-robot-antenna")).toBeInTheDocument();
    expect(screen.getAllByTestId("oli-robot-eye")).toHaveLength(2);
    // Blue, distinct from the white thinking orb.
    expect(head.innerHTML).toContain("bg-logo");
  });

  it("animates a slow bob while thinking", () => {
    render(<OliRobotHead status="thinking" />);

    const head = screen.getByTestId("oli-robot-head");
    expect(head).toHaveAttribute("data-oli-status", "thinking");
    expect(head.innerHTML).toContain("animate-oli-think");
    expect(head.innerHTML).not.toContain("animate-oli-code");
  });

  it("animates a faster writing beat while coding", () => {
    render(<OliRobotHead status="coding" />);

    const head = screen.getByTestId("oli-robot-head");
    expect(head).toHaveAttribute("data-oli-status", "coding");
    expect(head.innerHTML).toContain("animate-oli-code");
  });

  it("settles under reduced motion", () => {
    render(<OliRobotHead status="coding" />);

    expect(screen.getByTestId("oli-robot-head").innerHTML).toContain(
      "motion-reduce:animate-none",
    );
  });

  it("marks itself as decorative for screen readers", () => {
    render(<OliRobotHead status="thinking" />);
    expect(screen.getByTestId("oli-robot-head")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("accepts a size override", () => {
    render(<OliRobotHead status="thinking" size={24} />);
    const head = screen.getByTestId("oli-robot-head");
    expect(head.style.width).toBe("24px");
    expect(head.style.height).toBe("24px");
  });

  it("renders a static head (no animation classes) when animate is false", () => {
    render(<OliRobotHead status="coding" animate={false} />);

    const head = screen.getByTestId("oli-robot-head");
    expect(head.innerHTML).not.toContain("animate-oli-code");
    expect(head.innerHTML).not.toContain("animate-oli-think");
    expect(head.innerHTML).not.toContain("animate-oli-antenna");
    // Still the same blue robot head.
    expect(head.innerHTML).toContain("bg-logo");
  });

  it("honours a custom test id so brand marks can rename the root", () => {
    render(
      <OliRobotHead
        status="thinking"
        animate={false}
        testId="agent-brand-icon-openhands"
      />,
    );

    expect(
      screen.getByTestId("agent-brand-icon-openhands"),
    ).toBeInTheDocument();
  });
});
