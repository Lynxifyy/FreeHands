import { createDarkTheme } from "./_build";

/** Pink rose dark theme. */
export const freehandsSakura = createDarkTheme({
  label: "FreeHands-Sakura",
  scale: {
    "--cool-grey-50": "#FFF5F8",
    "--cool-grey-100": "#FFE9F0",
    "--cool-grey-200": "#FFD3E1",
    "--cool-grey-300": "#F7B3CA",
    "--cool-grey-400": "#EC8DAC",
    "--cool-grey-500": "#DC6B90",
    "--cool-grey-600": "#BE5278",
    "--cool-grey-700": "#9C3D60",
    "--cool-grey-800": "#772D49",
    "--cool-grey-900": "#521E32",
    "--cool-grey-925": "#3B1524",
    "--cool-grey-950": "#241017",
    "--cool-grey-975": "#15090D",
  },
  brand: {
    primary: "#F472B6",
    accent: "#FB7185",
    logo: "#F9A8D4",
    statusError: "#FFB3B8",
    danger: "#FF9CAB",
  },
});
