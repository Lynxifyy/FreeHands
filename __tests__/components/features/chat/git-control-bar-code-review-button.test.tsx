import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { GitControlBarCodeReviewButton } from "#/components/features/chat/git-control-bar-code-review-button";
import { getCodeReviewPrompt } from "#/utils/utils";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("#/hooks/use-tracking", () => ({
  useTracking: () => ({
    trackCodeReviewButtonClick: vi.fn(),
  }),
}));

vi.mock("#/icons/u-code-review.svg?react", () => ({
  default: ({ color }: { color?: string }) => (
    <svg data-testid="code-review-icon" data-color={color ?? ""} />
  ),
}));

describe("GitControlBarCodeReviewButton", () => {
  it("queues the code review prompt when clicked", () => {
    const onSuggestionsClick = vi.fn();
    render(
      <GitControlBarCodeReviewButton
        onSuggestionsClick={onSuggestionsClick}
        hasRepository
        providerTokensReady
      />,
    );

    screen.getByRole("button").click();

    expect(onSuggestionsClick).toHaveBeenCalledWith(getCodeReviewPrompt());
  });

  it("is disabled and muted without a repository", () => {
    render(
      <GitControlBarCodeReviewButton
        onSuggestionsClick={vi.fn()}
        hasRepository={false}
        providerTokensReady
      />,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button.className).toContain("text-muted");
    expect(screen.getByTestId("code-review-icon")).toHaveAttribute(
      "data-color",
      "var(--oh-muted)",
    );
  });
});
