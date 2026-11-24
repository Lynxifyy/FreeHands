import { describe, expect, it } from "vitest";
import { pinCuratedProviders } from "./use-search-providers";
import { TOKEN_HARBOR_PROVIDER } from "#/constants/token-harbor";

const provider = (name: string, verified = false) => ({ name, verified });

describe("pinCuratedProviders", () => {
  it("moves the shipped provider above the backend's alphabetical order", () => {
    const ordered = pinCuratedProviders([
      provider("anthropic", true),
      provider("openai", true),
      provider(TOKEN_HARBOR_PROVIDER),
    ]);

    expect(ordered.map((item) => item.name)).toEqual([
      TOKEN_HARBOR_PROVIDER,
      "anthropic",
      "openai",
    ]);
    expect(ordered[0].verified).toBe(false);
  });

  it("keeps every other provider in backend order", () => {
    const ordered = pinCuratedProviders([
      provider("a"),
      provider(TOKEN_HARBOR_PROVIDER),
      provider("b"),
      provider("c"),
    ]);

    expect(ordered.map((item) => item.name)).toEqual([
      TOKEN_HARBOR_PROVIDER,
      "a",
      "b",
      "c",
    ]);
  });

  it("leaves a backend that does not expose the provider untouched", () => {
    const providers = [provider("anthropic"), provider("openai")];

    expect(pinCuratedProviders(providers)).toEqual(providers);
  });
});
