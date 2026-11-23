import { useQuery } from "@tanstack/react-query";
import { fetchLatestFreeHandsRelease } from "#/api/freehands-releases";
import { APP_UPDATE_QUERY_KEYS } from "./query-keys";

/**
 * Latest FreeHands GitHub release, used by the Android update card. Failures
 * stay quiet; the card renders an inline "could not check" state.
 */
export function useLatestFreeHandsRelease({
  enabled = true,
}: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...APP_UPDATE_QUERY_KEYS.latestVersion, "freehands-github"],
    queryFn: ({ signal }) => fetchLatestFreeHandsRelease(signal),
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 60,
    meta: { disableToast: true },
  });
}
