import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StartTaskStatusIndicator } from "#/components/features/conversation-panel/start-task-card/start-task-status-indicator";

describe("StartTaskStatusIndicator", () => {
  it("renders an in-progress play badge with the animated gradient", () => {
    render(<StartTaskStatusIndicator taskStatus="STARTING_CONVERSATION" />);

    const indicator = screen.getByTestId("start-task-status-indicator");
    expect(indicator).toHaveAttribute("data-status", "STARTING_CONVERSATION");
    expect(indicator.className).toContain("status-play-gradient");
  });

  it("settles READY and ERROR into static colours", () => {
    const { rerender } = render(<StartTaskStatusIndicator taskStatus="READY" />);
    expect(
      screen.getByTestId("start-task-status-indicator").className,
    ).toContain("text-status-success");

    rerender(<StartTaskStatusIndicator taskStatus="ERROR" />);
    expect(
      screen.getByTestId("start-task-status-indicator").className,
    ).toContain("text-status-error");
  });
});
