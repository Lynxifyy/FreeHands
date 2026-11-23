/**
 * The hosted service FreeHands connects to when the user picks the Cloud
 * backend. Operators of a self-hosted FreeHands deployment override it with
 * `VITE_FREEHANDS_CLOUD_HOST`; otherwise the existing OpenHands-compatible
 * host is used so current deployments keep working.
 */
export const FREEHANDS_CLOUD_HOST =
  (import.meta.env.VITE_FREEHANDS_CLOUD_HOST as string | undefined)?.trim() ||
  "https://app.all-hands.dev";

export const FREEHANDS_CLOUD_NAME = "FreeHands Cloud";
