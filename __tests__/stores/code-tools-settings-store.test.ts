import { beforeEach, describe, expect, it } from "vitest";

import {
  CODE_TOOLS_SETTINGS_DEFAULTS,
  useCodeToolsSettingsStore,
} from "#/stores/code-tools-settings-store";

describe("useCodeToolsSettingsStore", () => {
  beforeEach(() => {
    useCodeToolsSettingsStore.setState({ ...CODE_TOOLS_SETTINGS_DEFAULTS });
    localStorage.clear();
  });

  it("starts with the documented defaults", () => {
    const state = useCodeToolsSettingsStore.getState();
    expect(state.critiqueStrictness).toBe("normal");
    expect(state.previewAutoRefresh).toBe(true);
    expect(state.previewAllowScripts).toBe(false);
  });

  it("updates the critique strictness", () => {
    useCodeToolsSettingsStore.getState().setCritiqueStrictness("strict");
    expect(useCodeToolsSettingsStore.getState().critiqueStrictness).toBe(
      "strict",
    );
  });

  it("updates the preview auto-refresh preference", () => {
    useCodeToolsSettingsStore.getState().setPreviewAutoRefresh(false);
    expect(useCodeToolsSettingsStore.getState().previewAutoRefresh).toBe(false);
  });

  it("updates the preview scripts preference", () => {
    useCodeToolsSettingsStore.getState().setPreviewAllowScripts(true);
    expect(useCodeToolsSettingsStore.getState().previewAllowScripts).toBe(true);
  });

  it("restores every default on reset", () => {
    const store = useCodeToolsSettingsStore.getState();
    store.setCritiqueStrictness("relaxed");
    store.setPreviewAutoRefresh(false);
    store.setPreviewAllowScripts(true);

    store.reset();

    const state = useCodeToolsSettingsStore.getState();
    expect(state.critiqueStrictness).toBe("normal");
    expect(state.previewAutoRefresh).toBe(true);
    expect(state.previewAllowScripts).toBe(false);
  });
});
