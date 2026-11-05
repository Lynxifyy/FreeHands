import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * How aggressively `code_critique` reports. Strict surfaces informational
 * findings too, normal keeps warnings and errors, relaxed shows only things
 * that will not work.
 */
export type CritiqueStrictness = "relaxed" | "normal" | "strict";

export const CRITIQUE_STRICTNESS_LEVELS: readonly CritiqueStrictness[] = [
  "relaxed",
  "normal",
  "strict",
];

export interface CodeToolsSettings {
  critiqueStrictness: CritiqueStrictness;
  /** Re-render the UI Preview when the agent edits the previewed file. */
  previewAutoRefresh: boolean;
  /**
   * Allow scripts inside the UI Preview iframe. Off by default: the iframe is
   * sandboxed without `allow-same-origin`, and most previews are static.
   */
  previewAllowScripts: boolean;
}

export const CODE_TOOLS_SETTINGS_DEFAULTS: CodeToolsSettings = {
  critiqueStrictness: "normal",
  previewAutoRefresh: true,
  previewAllowScripts: false,
};

const STORAGE_KEY = "code-tools-settings";

interface CodeToolsSettingsState extends CodeToolsSettings {
  setCritiqueStrictness: (value: CritiqueStrictness) => void;
  setPreviewAutoRefresh: (value: boolean) => void;
  setPreviewAllowScripts: (value: boolean) => void;
  reset: () => void;
}

/**
 * Single owner for the code-tooling preferences (critique verbosity and the UI
 * Preview options). Persisted to localStorage so the choice survives a reload
 * and applies before any conversation is opened; the values are frontend
 * behaviour, not agent settings, so they stay off the agent-server wire.
 */
export const useCodeToolsSettingsStore = create<CodeToolsSettingsState>()(
  persist(
    (set) => ({
      ...CODE_TOOLS_SETTINGS_DEFAULTS,
      setCritiqueStrictness: (critiqueStrictness) =>
        set({ critiqueStrictness }),
      setPreviewAutoRefresh: (previewAutoRefresh) =>
        set({ previewAutoRefresh }),
      setPreviewAllowScripts: (previewAllowScripts) =>
        set({ previewAllowScripts }),
      reset: () => set({ ...CODE_TOOLS_SETTINGS_DEFAULTS }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
