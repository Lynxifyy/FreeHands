import { beforeEach, describe, expect, it } from "vitest";

import { useUiPreviewStore } from "#/stores/ui-preview-store";

const CONVERSATION = "conversation-1";
const OTHER = "conversation-2";

describe("useUiPreviewStore", () => {
  beforeEach(() => {
    useUiPreviewStore.setState({ targets: {} });
  });

  it("starts with no preview target for a conversation", () => {
    expect(useUiPreviewStore.getState().targets[CONVERSATION]).toBeUndefined();
  });

  it("records the path and format when a target is set", () => {
    useUiPreviewStore.getState().setTarget(CONVERSATION, {
      path: "app/index.html",
      format: "html",
    });

    expect(useUiPreviewStore.getState().targets[CONVERSATION]).toMatchObject({
      path: "app/index.html",
      format: "html",
      refreshToken: 0,
      autoRefresh: true,
    });
  });

  it("resets the refresh token when the path changes", () => {
    const store = useUiPreviewStore.getState();
    store.setTarget(CONVERSATION, { path: "a.html", format: "html" });
    store.bumpRefresh(CONVERSATION);
    store.setTarget(CONVERSATION, { path: "b.html", format: "html" });

    expect(
      useUiPreviewStore.getState().targets[CONVERSATION].refreshToken,
    ).toBe(0);
  });

  it("keeps the refresh token when the same path is re-selected", () => {
    const store = useUiPreviewStore.getState();
    store.setTarget(CONVERSATION, { path: "a.html", format: "html" });
    store.bumpRefresh(CONVERSATION);
    store.setTarget(CONVERSATION, { path: "a.html", format: "html" });

    expect(
      useUiPreviewStore.getState().targets[CONVERSATION].refreshToken,
    ).toBe(1);
  });

  it("bumps the refresh token for the given conversation only", () => {
    const store = useUiPreviewStore.getState();
    store.setTarget(CONVERSATION, { path: "a.html", format: "html" });
    store.setTarget(OTHER, { path: "b.html", format: "html" });
    store.bumpRefresh(CONVERSATION);

    expect(
      useUiPreviewStore.getState().targets[CONVERSATION].refreshToken,
    ).toBe(1);
    expect(useUiPreviewStore.getState().targets[OTHER].refreshToken).toBe(0);
  });

  it("ignores a bump for a conversation with no target", () => {
    useUiPreviewStore.getState().bumpRefresh(CONVERSATION);
    expect(useUiPreviewStore.getState().targets[CONVERSATION]).toBeUndefined();
  });

  it("toggles auto refresh for a conversation", () => {
    const store = useUiPreviewStore.getState();
    store.setTarget(CONVERSATION, { path: "a.html", format: "html" });
    store.setAutoRefresh(CONVERSATION, false);

    expect(useUiPreviewStore.getState().targets[CONVERSATION].autoRefresh).toBe(
      false,
    );
  });

  it("clears only the requested conversation's target", () => {
    const store = useUiPreviewStore.getState();
    store.setTarget(CONVERSATION, { path: "a.html", format: "html" });
    store.setTarget(OTHER, { path: "b.html", format: "html" });
    store.clearTarget(CONVERSATION);

    expect(useUiPreviewStore.getState().targets[CONVERSATION]).toBeUndefined();
    expect(useUiPreviewStore.getState().targets[OTHER]).toBeDefined();
  });

  it("does not leak a target across conversations", () => {
    useUiPreviewStore.getState().setTarget(CONVERSATION, {
      path: "app/index.html",
      format: "html",
    });

    expect(useUiPreviewStore.getState().targets[OTHER]).toBeUndefined();
  });
});
