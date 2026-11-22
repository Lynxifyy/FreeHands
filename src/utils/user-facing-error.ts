export const CORS_OR_NETWORK_ERROR_MESSAGE =
  "Disconnected (check URL or network). Check that the backend URL is correct and the backend server is reachable. If the backend is on another origin, check that it allows this frontend origin.";

export const BACKEND_REQUEST_TIMEOUT_MESSAGE =
  "Disconnected (request timed out). Check that the backend URL is correct and reachable.";

/**
 * Gemini routed through Vertex AI fails with an opaque
 * `Vertex_ai_betaException - b''` when the deployment has no Google Cloud
 * project/credentials (or the model is not enabled in that project). Translate
 * it into the two things the user can actually do.
 */
export const VERTEX_AI_BETA_ERROR_MESSAGE =
  "Gemini could not reach Vertex AI. If you are using a Google AI Studio key, select the Gemini provider (a gemini/... model) instead of Vertex AI. To use Vertex AI, set the Google Cloud project, location and service-account credentials on the agent server.";

const MAX_CAUSE_DEPTH = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function collectErrorMessages(error: unknown): string[] {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  let depth = 0;

  while (current !== undefined && current !== null && depth < MAX_CAUSE_DEPTH) {
    if (seen.has(current)) break;
    seen.add(current);

    if (current instanceof Error) {
      if (current.message) messages.push(current.message);
      current = current.cause;
    } else if (typeof current === "string") {
      if (current) messages.push(current);
      break;
    } else if (isRecord(current)) {
      const message = current.message;
      if (typeof message === "string" && message) messages.push(message);
      current = current.cause;
    } else {
      break;
    }

    depth += 1;
  }

  return messages;
}

export function isCorsOrNetworkErrorMessage(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();

  return (
    normalized.includes("disconnected (check cors or network)") ||
    normalized.includes("disconnected (check url or network)") ||
    normalized.includes("blocked by cors") ||
    normalized.includes("failed to fetch") ||
    normalized.includes("network error") ||
    normalized.includes("load failed") ||
    normalized.includes("networkerror when attempting to fetch resource") ||
    (normalized.includes("cors") && normalized.includes("blocked"))
  );
}

export function isCorsOrNetworkError(error: unknown): boolean {
  return collectErrorMessages(error).some(isCorsOrNetworkErrorMessage);
}

export function isBackendRequestTimeoutMessage(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("request timeout") ||
    normalized.includes("timeout after") ||
    normalized.includes("backend request timed out")
  );
}

export function isVertexAiBetaErrorMessage(
  message: string | null | undefined,
): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return (
    normalized.includes("vertex_ai_betaexception") ||
    normalized.includes("vertex_ai_beta") ||
    (normalized.includes("vertex") && normalized.includes("b''"))
  );
}

export function getUserFacingConnectionErrorMessage(
  error: unknown,
): string | null {
  const messages = collectErrorMessages(error);
  if (messages.some(isCorsOrNetworkErrorMessage)) {
    return CORS_OR_NETWORK_ERROR_MESSAGE;
  }
  if (messages.some(isBackendRequestTimeoutMessage)) {
    return BACKEND_REQUEST_TIMEOUT_MESSAGE;
  }
  if (messages.some(isVertexAiBetaErrorMessage)) {
    return VERTEX_AI_BETA_ERROR_MESSAGE;
  }
  return messages[0] ?? null;
}
