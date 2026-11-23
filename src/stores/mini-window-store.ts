import { create } from "zustand";

export interface MiniWindowEntry {
  conversationId: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
}

interface OpenMiniWindowInput {
  conversationId: string;
  title: string;
}

interface MiniWindowState {
  windows: MiniWindowEntry[];
  open: (input: OpenMiniWindowInput) => void;
  close: (conversationId: string) => void;
  closeAll: () => void;
  toggleCollapsed: (conversationId: string) => void;
  move: (conversationId: string, x: number, y: number) => void;
  resize: (conversationId: string, width: number, height: number) => void;
  bringToFront: (conversationId: string) => void;
}

/** Three floating previews match the three concurrent chats a FreeHands runtime supports. */
export const MAX_MINI_WINDOWS = 3;

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 320;
const CASCADE_STEP = 28;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function viewport(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 1280, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

export const useMiniWindowStore = create<MiniWindowState>()((set, get) => ({
  windows: [],

  open: ({ conversationId, title }) => {
    const existing = get().windows.find(
      (entry) => entry.conversationId === conversationId,
    );
    if (existing) {
      set((state) => ({
        windows: [
          ...state.windows.filter(
            (entry) => entry.conversationId !== conversationId,
          ),
          { ...existing, collapsed: false },
        ],
      }));
      return;
    }

    const { width: vw, height: vh } = viewport();
    const count = get().windows.length;
    const x = clamp(
      vw - DEFAULT_WIDTH - 24 - count * CASCADE_STEP,
      12,
      Math.max(12, vw - DEFAULT_WIDTH - 12),
    );
    const y = clamp(
      vh - DEFAULT_HEIGHT - 24 - count * CASCADE_STEP,
      12,
      Math.max(12, vh - DEFAULT_HEIGHT - 12),
    );

    set((state) => ({
      windows: [
        ...state.windows.slice(-(MAX_MINI_WINDOWS - 1)),
        {
          conversationId,
          title,
          x,
          y,
          width: DEFAULT_WIDTH,
          height: DEFAULT_HEIGHT,
          collapsed: false,
        },
      ],
    }));
  },

  close: (conversationId) =>
    set((state) => ({
      windows: state.windows.filter(
        (entry) => entry.conversationId !== conversationId,
      ),
    })),

  closeAll: () => set({ windows: [] }),

  toggleCollapsed: (conversationId) =>
    set((state) => ({
      windows: state.windows.map((entry) =>
        entry.conversationId === conversationId
          ? { ...entry, collapsed: !entry.collapsed }
          : entry,
      ),
    })),

  move: (conversationId, x, y) =>
    set((state) => ({
      windows: state.windows.map((entry) =>
        entry.conversationId === conversationId
          ? { ...entry, x: Math.max(0, x), y: Math.max(0, y) }
          : entry,
      ),
    })),

  resize: (conversationId, width, height) =>
    set((state) => ({
      windows: state.windows.map((entry) =>
        entry.conversationId === conversationId
          ? {
              ...entry,
              width: Math.max(300, width),
              height: Math.max(180, height),
            }
          : entry,
      ),
    })),

  bringToFront: (conversationId) =>
    set((state) => {
      const target = state.windows.find(
        (entry) => entry.conversationId === conversationId,
      );
      if (!target || state.windows.at(-1) === target) return state;
      return {
        windows: [
          ...state.windows.filter(
            (entry) => entry.conversationId !== conversationId,
          ),
          target,
        ],
      };
    }),
}));
