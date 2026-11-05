import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface DiscordConnectRequest {
  conversationId: string;
  toolCallId: string;
  /** Guild the agent already knows about, if any. */
  guildId: string | null;
}

interface DiscordConnectState {
  /** Pending requests, oldest first; the modal shows one at a time. */
  requests: DiscordConnectRequest[];
}

interface DiscordConnectActions {
  enqueue: (request: DiscordConnectRequest) => void;
  dismiss: (toolCallId: string) => void;
}

// Persisted so a reload reopens a pending request: its tool call is already
// claimed, so the replayed ActionEvent will not queue it again.
export const useDiscordConnectStore = create<
  DiscordConnectState & DiscordConnectActions
>()(
  persist(
    (set) => ({
      requests: [],
      enqueue: (request) =>
        set((s) => ({ requests: [...s.requests, request] })),
      dismiss: (toolCallId) =>
        set((s) => ({
          requests: s.requests.filter((r) => r.toolCallId !== toolCallId),
        })),
    }),
    {
      name: "openhands-pending-discord-connects",
      storage: createJSONStorage(() => localStorage),
      partialize: (state): DiscordConnectState => ({
        requests: state.requests,
      }),
    },
  ),
);
