import { createLightTheme } from "./_build";

/** Warm light theme for daytime use. */
export const freehandsDawn = createLightTheme({
  label: "FreeHands-Dawn",
  scale: {
    "--cool-grey-50": "#FFFBF7",
    "--cool-grey-100": "#FFF4EA",
    "--cool-grey-200": "#FCE7D6",
    "--cool-grey-300": "#F5D3B8",
    "--cool-grey-400": "#E9B894",
    "--cool-grey-500": "#D89B72",
    "--cool-grey-600": "#BC7E57",
    "--cool-grey-700": "#986342",
    "--cool-grey-800": "#744B32",
    "--cool-grey-900": "#523524",
    "--cool-grey-925": "#3C271A",
    "--cool-grey-950": "#26180F",
    "--cool-grey-975": "#150C06",
  },
  brand: {
    primary: "#E07A5F",
    accent: "#F2A65A",
    logo: "#E58B6E",
    statusError: "#FFB4A8",
    danger: "#FFA294",
  },
});
