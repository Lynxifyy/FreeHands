/**
 * Model ids are `provider/model`. The provider is part of the routing contract
 * — `gemini/...` calls the Google AI Studio API, while `vertex_ai_beta/...`
 * calls Vertex AI and needs a GCP project plus service-account credentials.
 *
 * Mixing the two is what produces `Vertex_ai_betaException` for a user who
 * believes they selected Gemini. These helpers keep a selection on one
 * provider and repair a Vertex-prefixed Gemini id when the caller knows the
 * intended provider is Gemini.
 */

const GEMINI_MODEL_PREFIXES = ["vertex_ai_beta/", "vertex_ai/", "gemini/"];

function stripProviderPrefix(model: string): string {
  for (const prefix of GEMINI_MODEL_PREFIXES) {
    if (model.startsWith(prefix)) return model.slice(prefix.length);
  }
  return model;
}

/** True when the id routes through Vertex AI (not the Gemini API). */
export function isVertexAiModel(model: string | null | undefined): boolean {
  if (!model) return false;
  return model.startsWith("vertex_ai/") || model.startsWith("vertex_ai_beta/");
}

/** True when the id is a Gemini model on either route. */
export function isGeminiModel(model: string | null | undefined): boolean {
  if (!model) return false;
  return (
    model.startsWith("gemini/") ||
    isVertexAiModel(model) ||
    stripProviderPrefix(model).toLowerCase().startsWith("gemini-")
  );
}

/**
 * Build the id to save for a provider + model pick.
 *
 * - Gemini always resolves to `gemini/<bare>` so an API-key selection never
 *   silently becomes a Vertex call.
 * - Vertex keeps its explicit provider and is never double-prefixed.
 * - Other providers follow the normal `provider/model` shape.
 */
export function normalizeLlmModelId(
  provider: string | null | undefined,
  model: string | null | undefined,
): string | null {
  const trimmed = model?.trim() ?? "";
  if (!trimmed) return null;
  if (!provider) return trimmed;

  if (provider === "gemini") {
    return `gemini/${stripProviderPrefix(trimmed)}`;
  }

  if (provider === "vertex_ai" || provider === "vertex_ai_beta") {
    if (isVertexAiModel(trimmed)) return trimmed;
    return `${provider}/${stripProviderPrefix(trimmed)}`;
  }

  // A model already carrying a provider prefix is re-homed to the selected one
  // rather than becoming `provider/other/model`.
  const slash = trimmed.indexOf("/");
  if (slash !== -1) {
    return `${provider}/${trimmed.slice(slash + 1)}`;
  }
  return `${provider}/${trimmed}`;
}

/**
 * Repair a Vertex-prefixed Gemini id for the Gemini API. Used by the LLM
 * settings notice: the user picked Gemini, but the stored id still says Vertex.
 */
export function toGeminiApiModelId(model: string): string {
  return `gemini/${stripProviderPrefix(model)}`;
}
