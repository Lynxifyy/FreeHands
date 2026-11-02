import { expect, test, type Page } from "@playwright/test";

async function openEditor(page: Page) {
  await page.goto("/conversations/1");
  const consent = page.getByTestId("confirm-telemetry-preferences");
  await page.getByTestId("chat-interface").waitFor({ timeout: 30_000 });
  // Settings and backend health settle after the chat shell. The banner is absent on reload once saved.
  try {
    await consent.waitFor({ state: "visible", timeout: 5_000 });
    await page.getByRole("checkbox").uncheck();
    await consent.click();
    await expect(consent).toBeHidden();
  } catch (error) {
    if (await consent.isVisible()) throw error;
  }
  await page.getByTestId("right-panel-toggle").click();
  await page.getByTestId("file-tree-file-README.md").click();
  await page.getByTestId("files-tab-content-mode-toggle-option-edit").click();
  await expect(page.locator(".monaco-editor")).toBeVisible({ timeout: 30_000 });
}

async function replaceCode(page: Page, text: string) {
  await page.locator(".monaco-editor .view-lines").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(text);
  await expect(page.getByTestId("code-editor-dirty")).toBeVisible();
}

test.setTimeout(90_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("openhands-onboarded", "1");
    localStorage.setItem("analytics-consent", "false");
    localStorage.setItem("openhands-telemetry-consent", "denied");
    localStorage.setItem("openhands-telemetry-first-use", "true");
    localStorage.setItem(
      "openhands-backends",
      JSON.stringify([
        {
          id: "default-local",
          name: "Local",
          host: location.origin,
          apiKey: "test-key",
          kind: "local",
        },
      ]),
    );
    localStorage.setItem(
      "openhands-active-backend",
      JSON.stringify({
        backendId: "default-local",
        orgId: null,
      }),
    );
  });
});

// @spec EDITOR-DRAFT-1 — the real Monaco worker and upload path survive a reload.
test("edits and saves a workspace file through the real editor", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openEditor(page);
  await replaceCode(
    page,
    "# Saved by the browser\nPersistent workspace edit.\n",
  );
  await page.getByTestId("code-editor-save").click();
  await expect(page.getByTestId("code-editor-dirty")).toHaveCount(0);
  await openEditor(page);
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "Saved by the browser",
  );
  expect(errors).toEqual([]);
});

// @spec EDITOR-CONFLICT-1 — a concurrent agent write cannot silently overwrite the user's draft.
test("retains the draft when the workspace changes before saving", async ({
  page,
}) => {
  await openEditor(page);
  await replaceCode(page, "My unsaved work");
  const uploaded = await page.evaluate(async () => {
    const form = new FormData();
    form.append("file", new Blob(["Agent changed this file"]), "README.md");
    // Simulate a second workspace writer; this fixture must use the browser network stack so MSW owns it.
    // eslint-disable-next-line local/no-direct-agent-server-fetch
    const response = await fetch(
      "/api/file/upload?path=%2Fworkspace%2Fproject%2F1%2FREADME.md",
      {
        method: "POST",
        body: form,
      },
    );
    return response.ok;
  });
  expect(uploaded).toBe(true);
  await page.getByTestId("code-editor-save").click();
  await expect(page.getByTestId("code-editor-conflict")).toContainText(
    "Agent changed this file",
  );
  await expect(page.locator(".monaco-editor .view-lines")).toContainText(
    "My unsaved work",
  );
  await expect(page.getByTestId("code-editor-save")).toBeDisabled();
});
