import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "test-utils";

import UiPreviewPanel from "#/routes/preview-tab";
import { useUiPreviewStore } from "#/stores/ui-preview-store";
import { useWorkspaceMutationCounter } from "#/stores/use-workspace-mutation-counter";
import type { WorkspaceFileContent } from "#/hooks/query/use-workspace-file-content";

const CONVERSATION = "test-conversation-id";

const useWorkspaceFileContentMock = vi.fn();
vi.mock("#/hooks/query/use-workspace-file-content", () => ({
  useWorkspaceFileContent: (path: string | null) =>
    useWorkspaceFileContentMock(path),
}));

function fileContent(overrides: Partial<WorkspaceFileContent>): {
  data: WorkspaceFileContent;
} {
  return {
    data: {
      path: "app/index.html",
      kind: "text",
      text: "<p>hello</p>",
      staticUrl: "https://agent.example.com/workspace/app/index.html",
      mimeType: "text/html",
      ...overrides,
    },
  };
}

function renderPanel() {
  return renderWithProviders(<UiPreviewPanel />, {
    navigation: { conversationId: CONVERSATION },
  });
}

describe("UiPreviewPanel", () => {
  beforeEach(() => {
    useUiPreviewStore.setState({ targets: {} });
    useWorkspaceMutationCounter.setState({ count: 0 });
    useWorkspaceFileContentMock.mockReset();
    useWorkspaceFileContentMock.mockReturnValue(
      fileContent({ text: "<p>hello</p>" }),
    );
  });

  it("shows an empty state until a target is selected", () => {
    renderPanel();

    expect(screen.getByText("UI_PREVIEW$EMPTY_TITLE")).toBeInTheDocument();
    expect(screen.queryByTestId("ui-preview-frame")).not.toBeInTheDocument();
  });

  it("renders an HTML target in a sandboxed iframe with the file content", () => {
    useUiPreviewStore.getState().setTarget(CONVERSATION, {
      path: "app/index.html",
      format: "html",
    });

    renderPanel();

    const frame = screen.getByTestId("ui-preview-frame");
    expect(frame).toHaveAttribute("sandbox");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(frame.getAttribute("srcdoc")).toContain("<p>hello</p>");
  });

  it("renders an Android XML layout through the structural transformer", () => {
    useWorkspaceFileContentMock.mockReturnValue(
      fileContent({
        path: "res/layout/main.xml",
        mimeType: "application/xml",
        text: '<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" />',
      }),
    );
    useUiPreviewStore.getState().setTarget(CONVERSATION, {
      path: "res/layout/main.xml",
      format: "xml",
    });

    renderPanel();

    expect(
      screen.getByTestId("ui-preview-frame").getAttribute("srcdoc"),
    ).toContain('data-android-type="LinearLayout"');
  });

  it("renders a Compose target through the Compose transformer", () => {
    useWorkspaceFileContentMock.mockReturnValue(
      fileContent({
        path: "app/MainActivity.kt",
        mimeType: "text/plain",
        text: '@Composable fun X() { Column { Text("hi") } }',
      }),
    );
    useUiPreviewStore.getState().setTarget(CONVERSATION, {
      path: "app/MainActivity.kt",
      format: "compose",
    });

    renderPanel();

    expect(
      screen.getByTestId("ui-preview-frame").getAttribute("srcdoc"),
    ).toContain("flex-direction:column");
  });

  it("reports a load error instead of a blank pane", () => {
    useWorkspaceFileContentMock.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error("nope"),
      data: undefined,
    });
    useUiPreviewStore.getState().setTarget(CONVERSATION, {
      path: "app/index.html",
      format: "html",
    });

    renderPanel();

    expect(screen.getByTestId("ui-preview-error")).toHaveTextContent("nope");
  });

  it("bumps the refresh token when the user refreshes", async () => {
    const user = userEvent.setup();
    useUiPreviewStore.getState().setTarget(CONVERSATION, {
      path: "app/index.html",
      format: "html",
    });
    renderPanel();

    await user.click(screen.getByTestId("ui-preview-refresh"));

    expect(
      useUiPreviewStore.getState().targets[CONVERSATION].refreshToken,
    ).toBe(1);
  });

  it("toggles auto refresh from the toolbar", async () => {
    const user = userEvent.setup();
    useUiPreviewStore.getState().setTarget(CONVERSATION, {
      path: "app/index.html",
      format: "html",
    });
    renderPanel();

    await user.click(screen.getByTestId("ui-preview-auto-refresh"));

    expect(useUiPreviewStore.getState().targets[CONVERSATION].autoRefresh).toBe(
      false,
    );
  });
});
