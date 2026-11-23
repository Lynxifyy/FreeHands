import { describe, expect, it } from "vitest";
import { AVAILABLE_COLOR_THEMES, COLOR_THEMES } from "./index";

const SCALE_KEYS = [
  "--cool-grey-50",
  "--cool-grey-100",
  "--cool-grey-200",
  "--cool-grey-300",
  "--cool-grey-400",
  "--cool-grey-500",
  "--cool-grey-600",
  "--cool-grey-700",
  "--cool-grey-800",
  "--cool-grey-900",
  "--cool-grey-925",
  "--cool-grey-950",
  "--cool-grey-975",
] as const;

describe("color theme registry", () => {
  it("lists every registered theme in the picker", () => {
    expect(AVAILABLE_COLOR_THEMES.map((theme) => theme.key)).toEqual(
      Object.keys(COLOR_THEMES),
    );
  });

  it.each(Object.entries(COLOR_THEMES))(
    "%s defines a complete, paintable palette",
    (_key, theme) => {
      for (const scaleKey of SCALE_KEYS) {
        expect(theme.scale[scaleKey]).toMatch(/^#[0-9a-f]{6}$/i);
      }
      expect(theme.label.length).toBeGreaterThan(0);
      expect(["light", "dark"]).toContain(theme.appearance);
      expect(theme.heroui["--heroui-background"]).toMatch(/^\d+(\.\d+)? /);
      expect(theme.heroui["--heroui-background-foreground"]).toBeDefined();
    },
  );
});
