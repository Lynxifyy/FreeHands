import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AddAutomationMenu } from "#/components/features/automations/add-automation-menu";

function renderMenu(
  overrides: Partial<Parameters<typeof AddAutomationMenu>[0]>,
) {
  const props = {
    onAdd: vi.fn(),
    onImport: vi.fn(),
    onDiscord: vi.fn(),
    ...overrides,
  };
  render(<AddAutomationMenu {...props} />);
  return props;
}

describe("AddAutomationMenu", () => {
  it("offers a Discord entry that starts the Discord setup", async () => {
    const user = userEvent.setup();
    const props = renderMenu({});

    await user.click(screen.getByTestId("automations-add-automation"));
    await user.click(screen.getByTestId("automations-add-discord"));

    expect(props.onDiscord).toHaveBeenCalledTimes(1);
    expect(props.onAdd).not.toHaveBeenCalled();
  });

  it("still offers create and import", async () => {
    const user = userEvent.setup();
    const props = renderMenu({});

    await user.click(screen.getByTestId("automations-add-automation"));
    await user.click(screen.getByTestId("automations-add-automation-create"));
    await user.click(screen.getByTestId("automations-add-automation"));
    await user.click(screen.getByTestId("automations-import-automation"));

    expect(props.onAdd).toHaveBeenCalledTimes(1);
    expect(props.onImport).toHaveBeenCalledTimes(1);
  });
});
