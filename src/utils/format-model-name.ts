export const FREE_MODEL_BADGE_LABEL = "Free";

/** Suffix appended to a display name for a DB-flagged free OpenHands model. */
export const FREE_MODEL_SUFFIX = " (free)";

/**
 * Static pretty-print labels for OpenHands models known at build time. Free
 * status still comes only from the backend-provided `freeModels` set.
 */
export const FREE_OPENHANDS_MODELS = {
  "openhands/deepseek-v4-flash": "OpenHands DeepSeek V4 Flash",
} as const;

/**
 * Display labels for DeepSeek models. FreeHands is tuned for DeepSeek V4.1
 * Flash for coding, so the picker shows a readable name instead of the raw
 * routing id. OpenHands-hosted ids already have labels in
 * {@link FREE_OPENHANDS_MODELS}, which wins, so they are not repeated here.
 */
export const DEEPSEEK_MODEL_LABELS: Readonly<Record<string, string>> = {
  "deepseek/deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
  "deepseek/deepseek-v4-flash": "DeepSeek V4 Flash",
  "deepseek/deepseek-chat": "DeepSeek Chat",
  "deepseek/deepseek-reasoner": "DeepSeek Reasoner",
};

/** The model FreeHands recommends for coding. */
export const RECOMMENDED_DEEPSEEK_MODEL = "openhands/deepseek-v4.1-flash";

/** True when `model` routes to a DeepSeek model (any provider prefix). */
export function isDeepSeekModel(model: string | null | undefined): boolean {
  if (!model) return false;
  const last = model.split("/").pop()?.toLowerCase() ?? "";
  return last.startsWith("deepseek");
}

/**
 * A readable label for `model` when it is a known DeepSeek model, else null.
 * Callers fall back to their own formatting (e.g. stripping the route prefix).
 */
export function deepSeekModelLabel(
  model: string | null | undefined,
): string | null {
  if (!model) return null;
  return DEEPSEEK_MODEL_LABELS[model] ?? null;
}

/**
 * Label for the live thinking status (e.g. "DeepSeek V4.1 Flash is
 * thinking…"). Returns null for a non-DeepSeek model so callers keep their
 * default "Thinking" copy. Matches a known label by full id first, then by the
 * route's last segment, so an OpenHands-hosted DeepSeek route still shows the
 * product name; any other DeepSeek variant falls back to "DeepSeek".
 */
export function thinkingModelLabel(
  model: string | null | undefined,
): string | null {
  if (!isDeepSeekModel(model)) return null;
  const route = model!.split("/").pop() ?? "";
  const byLastSegment = Object.entries(DEEPSEEK_MODEL_LABELS).find(
    ([id]) => id.split("/").pop() === route,
  )?.[1];
  return deepSeekModelLabel(model) ?? byLastSegment ?? "DeepSeek";
}

/**
 * Set of free ``provider/model`` ids. The frontend no longer hardcodes which
 * OpenHands models are free — the set is sourced from the backend model list
 * (DB-driven), the same channel that carries `verified`. See
 * {@link useFreeModels}. Callers that lack the set treat every model as paid.
 */
export type FreeModelSet = ReadonlySet<string>;

const EMPTY_FREE_MODELS: FreeModelSet = new Set<string>();

/**
 * Whether a model id routes through the OpenHands provider (the `openhands/`
 * prefix). On cloud the OpenHands provider is backed by a server-minted LLM
 * key rather than a user-supplied one, so callers use this to hide the inline
 * API key / base URL inputs and strip those fields from the save payload.
 */
export const isOpenHandsProviderModel = (
  model: string | null | undefined,
): boolean => Boolean(model?.startsWith("openhands/"));

export const isFreeOpenHandsModel = (
  model: string | null | undefined,
  freeModels: FreeModelSet = EMPTY_FREE_MODELS,
): boolean => Boolean(model && freeModels.has(model));

function appendFreeSuffix(display: string, isFree: boolean): string {
  return isFree ? `${display}${FREE_MODEL_SUFFIX}` : display;
}

export function formatModelNameForDisplay(
  model: string | null | undefined,
  freeModels: FreeModelSet = EMPTY_FREE_MODELS,
): string | null {
  if (!model) return null;
  return appendFreeSuffix(model, isFreeOpenHandsModel(model, freeModels));
}

/**
 * Format a native (OpenHands-kind) routing model string for display, stripping
 * the provider route prefix (e.g. ``"anthropic/claude-sonnet-4-5-20250929"`` →
 * ``"claude-sonnet-4-5-20250929"``, ``"litellm_proxy/openai/gpt-4o"`` →
 * ``"gpt-4o"``) so a conversation chip shows a meaningful model name rather than
 * the full routing path.
 *
 * Returns ``null`` for an empty/nullish input, and falls back to the original
 * string when stripping the prefix would leave nothing (e.g. a trailing slash)
 * — never an empty string, which would collapse the chip text.
 *
 * A DB-flagged free model (matched against ``freeModels`` on its full id) keeps
 * the free suffix so the chip still signals it is free.
 *
 * Display-only: unlike {@link deriveProfileNameFromModel} this does not sanitize
 * to an identifier, so it keeps the real model id intact for the chip.
 */
export function formatNativeModelName(
  model: string | null | undefined,
  freeModels: FreeModelSet = EMPTY_FREE_MODELS,
): string | null {
  if (!model) return null;
  const isFree = isFreeOpenHandsModel(model, freeModels);
  const lastSegment = model.split("/").pop();
  return appendFreeSuffix(lastSegment || model, isFree);
}

/**
 * Display label used by the LLM-profile picker sub-line. Looks up the model in
 * the static label table for a prettier name, but appends `(free)` only when the
 * backend-provided `freeModels` set marks the concrete model free.
 */
export function formatModelPillLabel(
  model: string | null | undefined,
  freeModels: FreeModelSet = EMPTY_FREE_MODELS,
): string | null {
  if (!model) return null;
  const display =
    model in FREE_OPENHANDS_MODELS
      ? FREE_OPENHANDS_MODELS[model as keyof typeof FREE_OPENHANDS_MODELS]
      : (deepSeekModelLabel(model) ?? model);
  return appendFreeSuffix(display, isFreeOpenHandsModel(model, freeModels));
}
