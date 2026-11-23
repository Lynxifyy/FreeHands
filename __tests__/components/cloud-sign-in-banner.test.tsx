import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CloudSignInBanner } from "#/components/features/home/cloud-sign-in-banner";

const mockBackends = vi.fn();

vi.mock("#/contexts/active-backend-context", () => ({
  useActiveBackendContext: () => ({
    backends: mockBackends(),
    addBackend: vi.fn(),
  }),
}));

vi.mock("#/components/features/backends/device-flow-auth", () => ({
  DeviceFlowAuth: () => <div data-testid="device-flow-auth" />,
}));

vi.mock("#/api/agent-server-config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#/api/agent-server-config")>()),
  getLockedCloudHost: () => null,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("CloudSignInBanner", () => {
  it("invites the user to sign in while no cloud backend is registered", () => {
    mockBackends.mockReturnValue([
      { id: "local", name: "Local", host: "http://localhost", kind: "local" },
    ]);

    render(<CloudSignInBanner />);

    expect(screen.getByTestId("cloud-sign-in-banner")).toBeInTheDocument();
    expect(
      screen.getByTestId("cloud-sign-in-banner-action"),
    ).toBeInTheDocument();
  });

  it("hides once a cloud backend exists", () => {
    mockBackends.mockReturnValue([
      {
        id: "cloud",
        name: "Cloud",
        host: "https://app.all-hands.dev",
        kind: "cloud",
      },
    ]);

    render(<CloudSignInBanner />);

    expect(
      screen.queryByTestId("cloud-sign-in-banner"),
    ).not.toBeInTheDocument();
  });
});
