import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { AGENT_SERVER_UI_DEFAULT_CSS_VARIABLES } from "#/styles/agent-server-ui-style-scope";

const tailwindCss = readFileSync(`${process.cwd()}/src/tailwind.css`, "utf-8");

function token(name: string): string {
  const match = tailwindCss.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, "m"));
  expect(match, `Missing ${name} in tailwind.css`).not.toBeNull();
  return match![1].trim();
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  ) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const linear = [r, g, b].map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

/**
 * FreeHands brand: the accent that used to be gold (#c9b974) is blue. This is a
 * functional CSS contract — the brand tokens drive every primary button, badge
 * and the logo, so a stray gold value would render the old palette.
 */
describe("FreeHands blue brand", () => {
  const BRAND_TOKENS = ["--oh-color-primary", "--oh-accent", "--oh-color-logo"];

  it.each(BRAND_TOKENS)("%s is a blue, not the old gold", (name) => {
    const value = token(name);
    const [r, , b] = channels(value);
    // Blue-dominant and cool: the blue channel clearly leads and there is no
    // warm/yellow cast (gold has r ≈ g).
    expect(b, `${name} (${value}) should be blue-dominant`).toBeGreaterThan(r);
    expect(
      b - r,
      `${name} (${value}) is too close to a warm hue`,
    ).toBeGreaterThan(40);
  });

  it("does not keep the old gold hex on any brand token", () => {
    for (const name of BRAND_TOKENS) {
      expect(token(name).toLowerCase()).not.toBe("#c9b974");
      expect(token(name).toLowerCase()).not.toBe("#cfb755");
    }
  });

  it("keeps a readable dark foreground on the blue accent", () => {
    const accent = channels(token("--oh-accent"));
    const ink = luminance(channels("#0b0e14"));
    const surface = luminance(accent);
    const contrast =
      (Math.max(ink, surface) + 0.05) / (Math.min(ink, surface) + 0.05);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the warning role amber rather than blue", () => {
    // Warnings must stay distinguishable from the brand accent.
    const [r, g, b] = channels(token("--oh-warning"));
    expect(r).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(b);
  });

  it("ships the blue logo default in the scoped UI tokens", () => {
    const logo = AGENT_SERVER_UI_DEFAULT_CSS_VARIABLES["--oh-color-logo"];
    const [r, , b] = channels(logo);
    expect(b).toBeGreaterThan(r);
  });
});
