import { describe, test, expect } from "vitest";
import { createProviderFromEnv, AiConfigurationError } from "../src/provider";

describe("createProviderFromEnv", () => {
  test("uses the provider and model from the environment", () => {
    const provider = createProviderFromEnv({ AI_PROVIDER: "anthropic", AI_MODEL: "some-model", ANTHROPIC_API_KEY: "key" });
    expect(provider.name).toBe("anthropic");
    expect(provider.model).toBe("some-model");
  });

  test("provider name is case-insensitive", () => {
    expect(createProviderFromEnv({ AI_PROVIDER: " OpenAI ", OPENAI_API_KEY: "key" }).name).toBe("openai");
  });

  test("uses the provider's default model when AI_MODEL is empty", () => {
    const provider = createProviderFromEnv({ AI_PROVIDER: "openai", AI_MODEL: "", OPENAI_API_KEY: "key" });
    expect(provider.model).toBeTruthy();
  });

  test("without AI_PROVIDER uses the provider that has an API key", () => {
    expect(createProviderFromEnv({ OPENAI_API_KEY: "key" }).name).toBe("openai");
    expect(createProviderFromEnv({ AI_PROVIDER: "", ANTHROPIC_API_KEY: "key" }).name).toBe("anthropic");
    expect(createProviderFromEnv({ OPENAI_API_KEY: "key", ANTHROPIC_API_KEY: "key" }).name).toBe("openai");
  });

  test("ollama doesn't require an API key", () => {
    const provider = createProviderFromEnv({ AI_PROVIDER: "ollama", AI_MODEL: "llama3.2-vision" });
    expect(provider.name).toBe("ollama");
    expect(provider.model).toBe("llama3.2-vision");
  });

  test("throws a configuration error when nothing is set", () => {
    expect(() => createProviderFromEnv({})).toThrow(AiConfigurationError);
    expect(() => createProviderFromEnv({ OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" })).toThrow("AI provider is not configured");
  });

  test("throws a configuration error when the API key of the provider is missing", () => {
    expect(() => createProviderFromEnv({ AI_PROVIDER: "openai", ANTHROPIC_API_KEY: "key" })).toThrow(AiConfigurationError);
    expect(() => createProviderFromEnv({ AI_PROVIDER: "openai" })).toThrow("OPENAI_API_KEY is not set");
    expect(() => createProviderFromEnv({ AI_PROVIDER: "anthropic" })).toThrow("ANTHROPIC_API_KEY is not set");
  });

  test("throws a configuration error for an unknown provider", () => {
    expect(() => createProviderFromEnv({ AI_PROVIDER: "other" })).toThrow(AiConfigurationError);
    expect(() => createProviderFromEnv({ AI_PROVIDER: "other" })).toThrow("Unknown AI_PROVIDER \"other\"");
  });
});
