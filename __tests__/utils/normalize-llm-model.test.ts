import { describe, expect, it } from "vitest";
import {
  isGeminiModel,
  isVertexAiModel,
  normalizeLlmModelId,
  toGeminiApiModelId,
} from "#/utils/normalize-llm-model";

describe("normalizeLlmModelId", () => {
  it("routes a Gemini pick through the Gemini API, even from a Vertex id", () => {
    expect(normalizeLlmModelId("gemini", "gemini-2.5-pro")).toBe(
      "gemini/gemini-2.5-pro",
    );
    expect(
      normalizeLlmModelId("gemini", "vertex_ai_beta/gemini-2.5-pro"),
    ).toBe("gemini/gemini-2.5-pro");
    expect(normalizeLlmModelId("gemini", "vertex_ai/gemini-2.5-pro")).toBe(
      "gemini/gemini-2.5-pro",
    );
  });

  it("keeps an explicit Vertex selection on Vertex and does not double-prefix", () => {
    expect(normalizeLlmModelId("vertex_ai", "gemini-2.5-pro")).toBe(
      "vertex_ai/gemini-2.5-pro",
    );
    expect(
      normalizeLlmModelId("vertex_ai_beta", "vertex_ai_beta/gemini-2.5-pro"),
    ).toBe("vertex_ai_beta/gemini-2.5-pro");
  });

  it("re-homes an already-qualified model onto the selected provider", () => {
    expect(normalizeLlmModelId("openai", "anthropic/claude-opus-4")).toBe(
      "openai/claude-opus-4",
    );
    expect(normalizeLlmModelId("openai", "gpt-5")).toBe("openai/gpt-5");
  });

  it("returns null for an empty selection", () => {
    expect(normalizeLlmModelId("gemini", "")).toBeNull();
    expect(normalizeLlmModelId(null, "gpt-5")).toBe("gpt-5");
  });
});

describe("Gemini/Vertex predicates", () => {
  it("distinguishes the two routes", () => {
    expect(isVertexAiModel("vertex_ai_beta/gemini-2.5-pro")).toBe(true);
    expect(isVertexAiModel("gemini/gemini-2.5-pro")).toBe(false);
    expect(isGeminiModel("gemini/gemini-2.5-pro")).toBe(true);
    expect(isGeminiModel("vertex_ai/gemini-2.5-pro")).toBe(true);
  });

  it("rewrites a Vertex-prefixed id to the Gemini API", () => {
    expect(toGeminiApiModelId("vertex_ai_beta/gemini-2.5-pro")).toBe(
      "gemini/gemini-2.5-pro",
    );
  });
});
