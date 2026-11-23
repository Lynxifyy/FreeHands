import { createDarkTheme } from "./_build";

/** Green-cyan dark theme with a terminal feel. */
export const freehandsNeon = createDarkTheme({
  label: "FreeHands-Neon",
  scale: {
    "--cool-grey-50": "#F1FFF8",
    "--cool-grey-100": "#DFFBEC",
    "--cool-grey-200": "#BEF6D8",
    "--cool-grey-300": "#8EEBBE",
    "--cool-grey-400": "#5FDBA1",
    "--cool-grey-500": "#38C686",
    "--cool-grey-600": "#22A66D",
    "--cool-grey-700": "#1A8558",
    "--cool-grey-800": "#166644",
    "--cool-grey-900": "#114832",
    "--cool-grey-925": "#0C3324",
    "--cool-grey-950": "#072019",
    "--cool-grey-975": "#04110D",
  },
  brand: {
    primary: "#34D399",
    accent: "#22D3EE",
    logo: "#5EEAD4",
    statusError: "#FFB4A8",
    danger: "#FF9C93",
  },
});
