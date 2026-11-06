import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CodeToolsSettingsScreen } from "#/routes/code-tools-settings";
import {
  CODE_TOOLS_SETTINGS_DEFAULTS,
  useCodeToolsSettingsStore,
} from "#/stores/code-tools-settings-store";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("CodeToolsSettingsScreen", () => {
  beforeEach(() => {
    useCodeToolsSettingsStore.setState({ ...CODE_TOOLS_SETTINGS_DEFAULTS });
  });

  it("renders the two sections with the stored values", () => {
    render(<CodeToolsSettingsScreen />);

    expect(
      screen.getByTestId("code-tools-settings-screen"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("code-tools-strictness")).toBeInTheDocument();
    expect(
      screen.getByTestId("code-tools-preview-auto-refresh"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("code-tools-preview-allow-scripts"),
    ).toBeInTheDocument();
  });

  it("toggles preview auto-refresh", async () => {
    const user = userEvent.setup();
    render(<CodeToolsSettingsScreen />);

    await user.click(screen.getByTestId("code-tools-preview-auto-refresh"));

    expect(useCodeToolsSettingsStore.getState().previewAutoRefresh).toBe(false);
  });

  it("toggles allowing scripts in the preview", async () => {
    const user = userEvent.setup();
    render(<CodeToolsSettingsScreen />);

    await user.click(screen.getByTestId("code-tools-preview-allow-scripts"));

    expect(useCodeToolsSettingsStore.getState().previewAllowScripts).toBe(true);
  });

  it("resets every preference to its default", async () => {
    const user = userEvent.setup();
    const store = useCodeToolsSettingsStore.getState();
    store.setPreviewAutoRefresh(false);
    store.setPreviewAllowScripts(true);
    render(<CodeToolsSettingsScreen />);

    await user.click(screen.getByTestId("code-tools-reset"));

    const state = useCodeToolsSettingsStore.getState();
    expect(state.previewAutoRefresh).toBe(true);
    expect(state.previewAllowScripts).toBe(false);
  });
});
