import { SYSTEM_PROMPT } from "./prompt.js";

function resolveGrokConfig(apiKey) {
  const trimmed = apiKey.trim().replace(/^["']|["']$/g, "");

  // Groq keys look like gsk_...
  if (trimmed.startsWith("gsk_")) {
    return {
      apiKey: trimmed,
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: process.env.GROK_MODEL || "llama-3.3-70b-versatile"
    };
  }

  // xAI Grok keys
  return {
    apiKey: trimmed,
    url: "https://api.x.ai/v1/chat/completions",
    model: process.env.GROK_MODEL || "grok-2-latest"
  };
}

export async function askGrok(question) {
  const rawKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

  if (!rawKey) {
    throw new Error("GROK_API_KEY is not set in .env");
  }

  const { apiKey, url, model } = resolveGrokConfig(rawKey);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: 350,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: question }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message || "Grok request failed";
    throw new Error(message);
  }

  const answer = data?.choices?.[0]?.message?.content?.trim();

  if (!answer) {
    throw new Error("Grok returned an empty answer");
  }

  return answer;
}
