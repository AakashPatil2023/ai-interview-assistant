export function envValue(name) {
  return String(process.env[name] || "").trim().replace(/^["']|["']$/g, "");
}

export function getApiKey(provider) {
  const legacyKey = envValue("GROK_API_KEY");

  switch (provider) {
    case "openai":
      return envValue("OPENAI_API_KEY");
    case "gemini":
      return envValue("GEMINI_API_KEY") || envValue("GOOGLE_API_KEY");
    case "groq":
      return envValue("GROQ_API_KEY") || (legacyKey.startsWith("gsk_") ? legacyKey : "");
    case "grok":
      return envValue("XAI_API_KEY") || (legacyKey && !legacyKey.startsWith("gsk_") ? legacyKey : "");
    case "ollama":
      return envValue("OLLAMA_API_KEY");
    default:
      return "";
  }
}

export function normalizeBase64(value) {
  const raw = String(value || "").trim();
  const comma = raw.indexOf(",");
  return raw.startsWith("data:") && comma !== -1 ? raw.slice(comma + 1) : raw;
}
