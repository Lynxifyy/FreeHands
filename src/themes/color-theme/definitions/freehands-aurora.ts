import { createDarkTheme } from "./_build";

/** Violet-blue dark theme: cool, high-contrast, easy on long sessions. */
export const freehandsAurora = createDarkTheme({
  label: "FreeHands-Aurora",
  scale: {
    "--cool-grey-50": "#F4F6FF",
    "--cool-grey-100": "#E9EDFF",
    "--cool-grey-200": "#D6DDFF",
    "--cool-grey-300": "#B7C2FA",
    "--cool-grey-400": "#909DF0",
    "--cool-grey-500": "#6E7BE0",
    "--cool-grey-600": "#5561C4",
    "--cool-grey-700": "#414CA3",
    "--cool-grey-800": "#2E3680",
    "--cool-grey-900": "#1D2359",
    "--cool-grey-925": "#151A42",
    "--cool-grey-950": "#0B0E26",
    "--cool-grey-975": "#050614",
  },
  brand: {
    primary: "#7C8CFF",
    accent: "#A78BFA",
    logo: "#8FA2FF",
    danger: "#FF9C93",
  },
});
