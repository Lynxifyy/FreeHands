import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { McpLogoBadge } from "#/components/features/mcp-logo-badge";
import type { IntegrationCatalogEntry } from "@openhands/extensions/integrations";

const discordEntry = {
  id: "discord",
  name: "Discord",
} as IntegrationCatalogEntry;

describe("McpLogoBadge", () => {
  it("renders the bundled Discord mark instead of the remote logo", () => {
    const { container } = render(<McpLogoBadge entry={discordEntry} />);

    expect(screen.getByTitle("Discord")).toBeInTheDocument();
    // The bundled mark is an inline SVG; no `<img>` from a remote URL.
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});