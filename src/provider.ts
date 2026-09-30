import { LLMProvider } from "ai-form-response-extractor";
import { openai, anthropic, ollama, ProviderFactory } from "ai-form-response-extractor/providers";

export class AiConfigurationError extends Error { }

interface IProviderInfo {
  factory: ProviderFactory;
  // The provider reads the API key from this environment variable itself. A local provider doesn't need a key
  keyVariable?: string;
}

const providers: { [name: string]: IProviderInfo } = {
  openai: { factory: openai, keyVariable: "OPENAI_API_KEY" },
  anthropic: { factory: anthropic, keyVariable: "ANTHROPIC_API_KEY" },
  ollama: { factory: ollama }
};

function getProviderName(env: NodeJS.ProcessEnv): string {
  const name = (env.AI_PROVIDER || "").trim().toLowerCase();
  if (name) return name;
  // Without AI_PROVIDER the provider is the one that has an API key
  for (const key in providers) {
    const keyVariable = providers[key].keyVariable;
    if (keyVariable && env[keyVariable]) return key;
  }
  throw new AiConfigurationError("AI provider is not configured. Set AI_PROVIDER or an API key in the .env file (see .env.example)");
}

export function createProviderFromEnv(env: NodeJS.ProcessEnv = process.env): LLMProvider {
  const name = getProviderName(env);
  const info = providers[name];
  if (!info) {
    throw new AiConfigurationError(`Unknown AI_PROVIDER "${name}". Supported providers: ${Object.keys(providers).join(", ")}`);
  }
  // Report a missing key here, before a document is processed
  if (info.keyVariable && !env[info.keyVariable]) {
    throw new AiConfigurationError(`${info.keyVariable} is not set. Add it to the .env file (see .env.example)`);
  }
  const model = (env.AI_MODEL || "").trim();
  // Without AI_MODEL the provider uses its default model
  return model ? info.factory(model) : (<() => LLMProvider>info.factory)();
}
