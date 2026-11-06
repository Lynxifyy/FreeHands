import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CollapsibleThinking } from "#/components/conversation-events/chat/event-message-components/collapsible-thinking";

describe("CollapsibleThinking", () => {
  it("stays collapsed by default", () => {
    render(<CollapsibleThinking content={"First line\nSecond line"} />);

    expect(screen.getByTestId("collapsible-thinking-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      screen.queryByTestId("collapsible-thinking-content"),
    ).not.toBeInTheDocument();
  });

  it("shows the FreeHands thinking orb next to the label", () => {
    render(<CollapsibleThinking content="Reasoning here" />);

    expect(screen.getByTestId("thinking-orb")).toBeInTheDocument();
  });

  it("previews the first non-empty line while collapsed", () => {
    render(
      <CollapsibleThinking
        content={"\n\nThe user wants a Discord server\nMore detail follows"}
      />,
    );

    expect(
      screen.getByTestId("collapsible-thinking-preview"),
    ).toHaveTextContent("The user wants a Discord server");
  });

  it("expands to the full reasoning and hides the preview", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleThinking content={"Line one\nLine two with more detail"} />,
    );

    await user.click(screen.getByTestId("collapsible-thinking-toggle"));

    expect(screen.getByTestId("collapsible-thinking-toggle")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByTestId("collapsible-thinking-content"),
    ).toHaveTextContent("Line two with more detail");
    expect(
      screen.queryByTestId("collapsible-thinking-preview"),
    ).not.toBeInTheDocument();
  });

  it("renders nothing for empty content", () => {
    const { container } = render(<CollapsibleThinking content="   " />);
    expect(container).toBeEmptyDOMElement();
  });
});
