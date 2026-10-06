import { askGemini } from "./gemini.js";
import { askGrok, askGroq } from "./grok.js";
import { askOpenAI } from "./openai.js";
import { askOllama } from "./ollama.js";
import { envValue, getApiKey } from "./llm-config.js";

// Quality-first defaults. Providers without a configured key are skipped.
const DEFAULT_ORDER = ["openai", "gemini", "grok", "groq", "ollama"];
const PROVIDERS = { openai: askOpenAI, gemini: askGemini, grok: askGrok, groq: askGroq, ollama: askOllama };

function normalizeProvider(value) {
  const provider = value.trim().toLowerCase();
  if (provider === "xai") return "grok";
  if (provider === "google") return "gemini";
  // Preserve the legacy LLM_PROVIDER=grok setting for Groq keys.
  if (provider === "grok" && !getApiKey("grok") && getApiKey("groq")) return "groq";
  return provider;
}

export function getProviderOrder() {
  const preferred = normalizeProvider(envValue("LLM_PROVIDER") || "auto");
  const customOrder = envValue("LLM_PROVIDER_ORDER").split(",").filter((value) => value.trim()).map(normalizeProvider);
  const requested = [...(preferred === "auto" ? [] : [preferred]), ...customOrder];

  for (const provider of requested) {
    if (!DEFAULT_ORDER.includes(provider)) {
      throw new Error(`Unknown LLM provider "${provider}". Use auto, openai, gemini, grok, groq, or ollama.`);
    }
  }

  return [...new Set([...requested, ...DEFAULT_ORDER])].filter((provider) => getApiKey(provider));
}

export async function getAnswer(question, options = {}) {
  const order = getProviderOrder();
  if (!order.length) {
    throw new Error("No LLM API keys configured. Set OPENAI_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, GROK_API_KEY, XAI_API_KEY, or OLLAMA_API_KEY in .env.");
  }

  const failures = [];
  for (const provider of order) {
    try {
      const answer = await PROVIDERS[provider](question, options);
      return { answer, provider };
    } catch (error) {
      failures.push(`${provider}: ${error.message}`);
      console.warn(`[LLM] ${provider} failed: ${error.message}`);
    }
  }

  throw new Error(`All configured LLM providers failed. ${failures.join("; ")}`);
}
