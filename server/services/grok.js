import { envValue, getApiKey, normalizeBase64 } from "./llm-config.js";
import { requestJson } from "./llm-request.js";
import { SYSTEM_PROMPT, withScreenContext } from "./prompt.js";

async function complete(provider, question, options) {
  const apiKey = getApiKey(provider);
  const isGroq = provider === "groq";
  if (!apiKey) {
    throw new Error(`${isGroq ? "GROQ_API_KEY" : "GROK_API_KEY or XAI_API_KEY"} is not set in .env`);
  }

  const imageBase64 = normalizeBase64(options.imageBase64);
  const legacyModel = envValue("GROK_API_KEY").startsWith("gsk_") === isGroq;
  const textModel = isGroq
    ? envValue("GROQ_MODEL") || (legacyModel && envValue("GROK_MODEL")) || "openai/gpt-oss-120b"
    : envValue("XAI_MODEL") || (legacyModel && envValue("GROK_MODEL")) || "grok-4.7";
  const model = imageBase64
    ? (isGroq ? envValue("GROQ_VISION_MODEL") : envValue("XAI_VISION_MODEL"))
      || (legacyModel && envValue("GROK_VISION_MODEL"))
      || (isGroq ? "qwen/qwen3.8-27b" : textModel)
    : textModel;

  const userContent = imageBase64
    ? [
        { type: "text", text: withScreenContext(question, true) },
        {
          type: "image_url",
          image_url: { url: `data:${options.mimeType || "image/jpeg"};base64,${imageBase64}` }
        }
      ]
    : question;

  const data = await requestJson(isGroq ? "Groq" : "Grok", isGroq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: 4096,
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ]
    })
  });

  const answer = data?.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    throw new Error(`${isGroq ? "Groq" : "Grok"} returned an empty answer`);
  }
  return answer;
}

export function askGrok(question, options = {}) {
  return complete("grok", question, options);
}

export function askGroq(question, options = {}) {
  return complete("groq", question, options);
}
