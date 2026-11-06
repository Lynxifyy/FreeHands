import { create } from "zustand";

import type { UiPreviewFormat } from "#/services/ui-preview/format-detect";

/** A file the UI Preview tab should render, plus its view options. */
export interface UiPreviewTarget {
  /** Workspace-relative path of the previewed file. */
  path: string;
  format: UiPreviewFormat;
  /**
   * Increments when the preview should be re-rendered even though the path
   * has not moved (agent edit, manual Refresh). Mirrors the workspace
   * mutation counter pattern used by the Files tab.
   */
  refreshToken: number;
  /** Whether agent file edits re-render this preview automatically. */
  autoRefresh: boolean;
}

interface UiPreviewState {
  /** Keyed by conversation id so a preview never leaks between conversations. */
  targets: Record<string, UiPreviewTarget>;
  setTarget: (
    conversationId: string,
    target: { path: string; format: UiPreviewFormat },
  ) => void;
  /** Re-render the current target; no-op when the conversation has none. */
  bumpRefresh: (conversationId: string) => void;
  setAutoRefresh: (conversationId: string, autoRefresh: boolean) => void;
  clearTarget: (conversationId: string) => void;
}

/**
 * Owns which file the UI Preview tab renders for each conversation. The tab is
 * one of the right-side drawer panels, so the selection is intentionally
 * in-memory (like the drawer's open/closed state) and per conversation.
 */
export const useUiPreviewStore = create<UiPreviewState>((set) => ({
  targets: {},

  setTarget: (conversationId, target) =>
    set((state) => {
      const existing = state.targets[conversationId];
      // Re-selecting the same file keeps its refresh history so the iframe
      // does not reload for nothing; switching files starts fresh.
      const refreshToken =
        existing?.path === target.path ? existing.refreshToken : 0;
      return {
        targets: {
          ...state.targets,
          [conversationId]: {
            path: target.path,
            format: target.format,
            refreshToken,
            autoRefresh: existing?.autoRefresh ?? true,
          },
        },
      };
    }),

  bumpRefresh: (conversationId) =>
    set((state) => {
      const existing = state.targets[conversationId];
      if (!existing) return state;
      return {
        targets: {
          ...state.targets,
          [conversationId]: {
            ...existing,
            refreshToken: existing.refreshToken + 1,
          },
        },
      };
    }),

  setAutoRefresh: (conversationId, autoRefresh) =>
    set((state) => {
      const existing = state.targets[conversationId];
      if (!existing) return state;
      return {
        targets: {
          ...state.targets,
          [conversationId]: { ...existing, autoRefresh },
        },
      };
    }),

  clearTarget: (conversationId) =>
    set((state) => {
      if (!state.targets[conversationId]) return state;
      const { [conversationId]: _removed, ...rest } = state.targets;
      return { targets: rest };
    }),
}));
