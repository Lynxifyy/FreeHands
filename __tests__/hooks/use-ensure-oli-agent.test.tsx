import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEnsureOliAgent } from "#/hooks/use-ensure-oli-agent";

const { ensureMock, agentProfiles } = vi.hoisted(() => ({
  ensureMock: vi.fn(),
  agentProfiles: {
    value: {
      profiles: [{ id: "oli-id", name: "Oli" }],
      active_agent_profile_id: "oli-id",
    },
  },
}));

vi.mock("#/api/agent-profiles-service/oli-agent-profile", () => ({
  ensureOliAgentProfile: ensureMock,
}));
vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackend: () => ({
    backend: { id: "local-1", kind: "local" },
    orgId: null,
  }),
}));
vi.mock("#/hooks/query/use-agent-profiles", () => ({
  useAgentProfiles: () => ({
    data: agentProfiles.value,
    isError: false,
  }),
}));
vi.mock("#/hooks/query/use-llm-profiles", () => ({
  useLlmProfiles: () => ({
    data: { profiles: [{ name: "mock-llm" }], active_profile: "mock-llm" },
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useEnsureOliAgent", () => {
  beforeEach(() => {
    ensureMock.mockReset();
    ensureMock.mockResolvedValue({
      name: "Oli",
      activated: true,
      created: false,
    });
    agentProfiles.value = {
      profiles: [{ id: "oli-id", name: "Oli" }],
      active_agent_profile_id: "oli-id",
    };
  });

  it("re-ensures an already-active Oli profile so retired tools are repaired", async () => {
    renderHook(() => useEnsureOliAgent(), { wrapper });

    await waitFor(() => expect(ensureMock).toHaveBeenCalledTimes(1));
  });

  it("leaves a deliberately chosen custom profile alone", async () => {
    agentProfiles.value = {
      profiles: [{ id: "custom-id", name: "my-agent" }],
      active_agent_profile_id: "custom-id",
    };

    renderHook(() => useEnsureOliAgent(), { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(ensureMock).not.toHaveBeenCalled();
  });
});
