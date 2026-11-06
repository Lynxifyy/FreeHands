import { describe, expect, it } from "vitest";
import {
  DEEPSEEK_MODEL_LABELS,
  RECOMMENDED_DEEPSEEK_MODEL,
  deepSeekModelLabel,
  formatModelPillLabel,
  isDeepSeekModel,
} from "./format-model-name";

describe("formatModelPillLabel", () => {
  it("keeps the pretty OpenHands label without a free suffix unless backend marks it free", () => {
    expect(formatModelPillLabel("openhands/deepseek-v4-flash")).toBe(
      "OpenHands DeepSeek V4 Flash",
    );

    expect(
      formatModelPillLabel(
        "openhands/deepseek-v4-flash",
        new Set(["openhands/deepseek-v4-flash"]),
      ),
    ).toBe("OpenHands DeepSeek V4 Flash (free)");
  });

  it("pretty-prints a direct DeepSeek model id", () => {
    expect(formatModelPillLabel("deepseek/deepseek-v4.1-flash")).toBe(
      "DeepSeek V4.1 Flash",
    );
  });
});

describe("DeepSeek model helpers", () => {
  it("recognises a DeepSeek model behind any provider prefix", () => {
    expect(isDeepSeekModel("openhands/deepseek-v4.1-flash")).toBe(true);
    expect(isDeepSeekModel("deepseek/deepseek-reasoner")).toBe(true);
    expect(isDeepSeekModel("litellm_proxy/deepseek/deepseek-chat")).toBe(true);
    expect(isDeepSeekModel("openai/gpt-5.6-sol")).toBe(false);
    expect(isDeepSeekModel(null)).toBe(false);
  });

  it("labels the known DeepSeek ids", () => {
    expect(deepSeekModelLabel("deepseek/deepseek-v4.1-flash")).toBe(
      "DeepSeek V4.1 Flash",
    );
    expect(deepSeekModelLabel("openai/gpt-5.6-sol")).toBeNull();
  });

  it("recommends a DeepSeek V4.1 Flash model", () => {
    expect(RECOMMENDED_DEEPSEEK_MODEL).toContain("deepseek-v4.1-flash");
    expect(
      Object.values(DEEPSEEK_MODEL_LABELS).some((label) =>
        label.includes("V4.1 Flash"),
      ),
    ).toBe(true);
  });
});
