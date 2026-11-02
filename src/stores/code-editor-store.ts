import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { getActiveBackend } from "#/api/backend-registry/active-store";

export interface CodeEditorDraft {
  baseText: string;
  text: string;
}

export function getCodeEditorDraftKey(
  conversationId: string,
  path: string,
): string {
  return JSON.stringify([getActiveBackend().backend.id, conversationId, path]);
}

interface CodeEditorState {
  drafts: Record<string, CodeEditorDraft>;
  setDraft: (
    conversationId: string,
    path: string,
    baseText: string,
    text: string,
  ) => void;
  clearDraft: (conversationId: string, path: string) => void;
}

/** Explicit-save drafts belong to one backend + conversation + file, never a basename. */
export const useCodeEditorStore = create<CodeEditorState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (conversationId, path, baseText, text) => {
        const key = getCodeEditorDraftKey(conversationId, path);
        set((state) => {
          const drafts = { ...state.drafts };
          if (text === baseText) delete drafts[key];
          else drafts[key] = { baseText, text };
          return { drafts };
        });
      },
      clearDraft: (conversationId, path) => {
        const key = getCodeEditorDraftKey(conversationId, path);
        set((state) => {
          const drafts = { ...state.drafts };
          delete drafts[key];
          return { drafts };
        });
      },
    }),
    {
      name: "agent-canvas:code-editor-drafts",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ drafts: state.drafts }),
    },
  ),
);
