/**
 * Token Harbor (https://tokenharbor.ai) is FreeHands' default model host: an
 * OpenAI-compatible gateway whose `:free` route serves DeepSeek V4.1 Flash at
 * no cost. The provider itself is registered in the bundled litellm fork, so
 * model ids route as `tokenharbor/<model>` and the agent server lists the
 * provider alongside the stock litellm providers.
 */
export const TOKEN_HARBOR_PROVIDER = "tokenharbor";

/** Human-readable provider name shown in the provider picker. */
export const TOKEN_HARBOR_LABEL = "Token Harbor";

/** OpenAI-compatible base URL; also litellm's registry default. */
export const TOKEN_HARBOR_BASE_URL = "https://tokenharbor.ai/v1";

/** Free route FreeHands ships as its recommended model. */
export const TOKEN_HARBOR_DEFAULT_MODEL =
  "tokenharbor/deepseek-v4.1-flash:free";

/**
 * Providers pinned above the backend-provided list, in order. The backend
 * returns providers alphabetically, which buries the one FreeHands ships with.
 */
export const PINNED_PROVIDERS: readonly string[] = [TOKEN_HARBOR_PROVIDER];

/** True when `provider` is the Token Harbor provider id. */
export function isTokenHarborProvider(
  provider: string | null | undefined,
): boolean {
  return provider === TOKEN_HARBOR_PROVIDER;
}

/** True when `model` routes through Token Harbor. */
export function isTokenHarborModel(model: string | null | undefined): boolean {
  return Boolean(model?.startsWith(`${TOKEN_HARBOR_PROVIDER}/`));
}
