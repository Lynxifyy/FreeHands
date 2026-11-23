import type { ColorThemeDefinition } from "../types";

/**
 * Shared palette keys every theme must define. Kept in one place so a new
 * theme is a compact palette + accent instead of a copy of the 13-entry scale
 * and the 30-entry HeroUI channel map.
 */
export interface ThemeScale {
  /** Allows the scale to satisfy `Record<string, string>` consumers. */
  [key: string]: string;
  "--cool-grey-50": string;
  "--cool-grey-100": string;
  "--cool-grey-200": string;
  "--cool-grey-300": string;
  "--cool-grey-400": string;
  "--cool-grey-500": string;
  "--cool-grey-600": string;
  "--cool-grey-700": string;
  "--cool-grey-800": string;
  "--cool-grey-900": string;
  "--cool-grey-925": string;
  "--cool-grey-950": string;
  "--cool-grey-975": string;
}

export interface ThemeBrand {
  /** Primary button / accent color (`--oh-color-primary`). */
  primary: string;
  /** Secondary accent (`--oh-accent`). */
  accent: string;
  /** Logo tint (`--oh-color-logo`). */
  logo: string;
  /**
   * Error red. Dark palettes need a lighter red than the shared default to
   * clear 4.5:1 against their modal and raised surfaces.
   */
  danger?: string;
  /** Status-error ink for the context meter track; lighter on deep palettes. */
  statusError?: string;
}

interface BuildThemeOptions {
  label: string;
  scale: ThemeScale;
  brand: ThemeBrand;
}

/** Convert `#rrggbb` to HeroUI's space-separated HSL channels. */
export function hexToHslChannels(hex: string): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  const round = (n: number) => Number(n.toFixed(2));
  return `${round(hue)} ${round(saturation * 100)}% ${round(lightness * 100)}%`;
}

function brandTokens(brand: ThemeBrand): ColorThemeDefinition["tokens"] {
  return {
    "--oh-color-primary": brand.primary,
    "--oh-accent": brand.accent,
    "--oh-color-logo": brand.logo,
    ...(brand.danger ? { "--oh-color-danger": brand.danger } : {}),
    ...(brand.statusError ? { "--oh-status-error": brand.statusError } : {}),
  };
}

/** Build a dark theme: HeroUI's channels are derived from the scale. */
export function createDarkTheme({
  label,
  scale,
  brand,
}: BuildThemeOptions): ColorThemeDefinition {
  const hsl = (key: keyof ThemeScale) => hexToHslChannels(scale[key]);

  return {
    label,
    appearance: "dark",
    scale,
    tokens: brandTokens(brand),
    heroui: {
      "--heroui-background": hsl("--cool-grey-950"),
      "--heroui-background-foreground": hsl("--cool-grey-50"),
      "--heroui-foreground-50": hsl("--cool-grey-975"),
      "--heroui-foreground-100": hsl("--cool-grey-950"),
      "--heroui-foreground-200": hsl("--cool-grey-900"),
      "--heroui-foreground-300": hsl("--cool-grey-800"),
      "--heroui-foreground-400": hsl("--cool-grey-700"),
      "--heroui-foreground-500": hsl("--cool-grey-600"),
      "--heroui-foreground-600": hsl("--cool-grey-500"),
      "--heroui-foreground-700": hsl("--cool-grey-400"),
      "--heroui-foreground-800": hsl("--cool-grey-300"),
      "--heroui-foreground-900": hsl("--cool-grey-200"),
      "--heroui-foreground": hsl("--cool-grey-300"),
      "--heroui-content1": hsl("--cool-grey-925"),
      "--heroui-content1-foreground": hsl("--cool-grey-100"),
      "--heroui-content2": hsl("--cool-grey-900"),
      "--heroui-content2-foreground": hsl("--cool-grey-100"),
      "--heroui-content3": hsl("--cool-grey-800"),
      "--heroui-content3-foreground": hsl("--cool-grey-200"),
      "--heroui-content4": hsl("--cool-grey-700"),
      "--heroui-content4-foreground": hsl("--cool-grey-300"),
      "--heroui-default-50": hsl("--cool-grey-975"),
      "--heroui-default-100": hsl("--cool-grey-950"),
      "--heroui-default-200": hsl("--cool-grey-900"),
      "--heroui-default-300": hsl("--cool-grey-800"),
      "--heroui-default-400": hsl("--cool-grey-700"),
      "--heroui-default-500": hsl("--cool-grey-600"),
      "--heroui-default-600": hsl("--cool-grey-500"),
      "--heroui-default-700": hsl("--cool-grey-400"),
      "--heroui-default-800": hsl("--cool-grey-300"),
      "--heroui-default-900": hsl("--cool-grey-200"),
      "--heroui-default-foreground": hsl("--cool-grey-50"),
      "--heroui-default": hsl("--cool-grey-700"),
    },
  };
}

/** Build a light theme: the HeroUI scales run the other way. */
export function createLightTheme({
  label,
  scale,
  brand,
}: BuildThemeOptions): ColorThemeDefinition {
  const hsl = (key: keyof ThemeScale) => hexToHslChannels(scale[key]);

  return {
    label,
    appearance: "light",
    scale,
    tokens: brandTokens(brand),
    heroui: {
      "--heroui-background": hsl("--cool-grey-50"),
      "--heroui-background-foreground": hsl("--cool-grey-950"),
      "--heroui-foreground-50": hsl("--cool-grey-50"),
      "--heroui-foreground-100": hsl("--cool-grey-100"),
      "--heroui-foreground-200": hsl("--cool-grey-200"),
      "--heroui-foreground-300": hsl("--cool-grey-300"),
      "--heroui-foreground-400": hsl("--cool-grey-400"),
      "--heroui-foreground-500": hsl("--cool-grey-500"),
      "--heroui-foreground-600": hsl("--cool-grey-600"),
      "--heroui-foreground-700": hsl("--cool-grey-700"),
      "--heroui-foreground-800": hsl("--cool-grey-800"),
      "--heroui-foreground-900": hsl("--cool-grey-900"),
      "--heroui-foreground": hsl("--cool-grey-900"),
      "--heroui-content1": hsl("--cool-grey-100"),
      "--heroui-content1-foreground": hsl("--cool-grey-950"),
      "--heroui-content2": hsl("--cool-grey-200"),
      "--heroui-content2-foreground": hsl("--cool-grey-900"),
      "--heroui-content3": hsl("--cool-grey-300"),
      "--heroui-content3-foreground": hsl("--cool-grey-800"),
      "--heroui-content4": hsl("--cool-grey-400"),
      "--heroui-content4-foreground": hsl("--cool-grey-700"),
      "--heroui-default-50": hsl("--cool-grey-50"),
      "--heroui-default-100": hsl("--cool-grey-100"),
      "--heroui-default-200": hsl("--cool-grey-200"),
      "--heroui-default-300": hsl("--cool-grey-300"),
      "--heroui-default-400": hsl("--cool-grey-400"),
      "--heroui-default-500": hsl("--cool-grey-500"),
      "--heroui-default-600": hsl("--cool-grey-600"),
      "--heroui-default-700": hsl("--cool-grey-700"),
      "--heroui-default-800": hsl("--cool-grey-800"),
      "--heroui-default-900": hsl("--cool-grey-900"),
      "--heroui-default-foreground": hsl("--cool-grey-950"),
      "--heroui-default": hsl("--cool-grey-300"),
    },
  };
}
