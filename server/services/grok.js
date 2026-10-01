import { SYSTEM_PROMPT, withScreenContext } from "./prompt.js";

function resolveGrokConfig(apiKey) {
  const trimmed = apiKey.trim().replace(/^["']|["']$/g, "");

  // Groq keys look like gsk_...
  if (trimmed.startsWith("gsk_")) {
    return {
      apiKey: trimmed,
      url: "https://api.groq.com/openai/v1/chat/completions",
      model: process.env.GROK_MODEL || "openai/gpt-oss-120b"
    };
  }

  // xAI Grok keys
  return {
    apiKey: trimmed,
    url: "https://api.x.ai/v1/chat/completions",
    model: process.env.GROK_MODEL || "grok-2-latest"
  };
}

function normalizeBase64(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  const comma = raw.indexOf(",");
  if (raw.startsWith("data:") && comma !== -1) {
    return raw.slice(comma + 1);
  }

  return raw;
}

function visionModelFor(isGroq) {
  if (process.env.GROK_VISION_MODEL) {
    return process.env.GROK_VISION_MODEL;
  }

  return isGroq ? "qwen/qwen3.8-27b" : "grok-4";
}

async function completeGrok({
  apiKey,
  url,
  model,
  question,
  imageBase64,
  mimeType
}) {
  const userContent = imageBase64
    ? [
        { type: "text", text: withScreenContext(question, true) },
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`
          }
        }
      ]
    : question;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      max_tokens: 1024,
      ...(String(model).startsWith("openai/gpt-oss")
        ? { reasoning_effort: "low" }
        : {}),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent }
      ]
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || "Grok request failed";
    throw new Error(message);
  }

  const answer = data?.choices?.[0]?.message?.content?.trim();

  if (!answer) {
    throw new Error("Grok returned an empty answer");
  }

  return answer;
}

export async function askGrok(question, options = {}) {
  const rawKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;

  if (!rawKey) {
    throw new Error("GROK_API_KEY is not set in .env");
  }

  const { apiKey, url, model } = resolveGrokConfig(rawKey);
  const imageBase64 = normalizeBase64(options.imageBase64);
  const mimeType = options.mimeType || "image/jpeg";
  const isGroq = apiKey.startsWith("gsk_");

  if (!imageBase64) {
    return completeGrok({
      apiKey,
      url,
      model,
      question,
      imageBase64: "",
      mimeType
    });
  }

  try {
    return await completeGrok({
      apiKey,
      url,
      model: visionModelFor(isGroq),
      question,
      imageBase64,
      mimeType
    });
  } catch (error) {
    console.error("Vision request failed, retrying text-only:", error.message);
    return completeGrok({
      apiKey,
      url,
      model,
      question,
      imageBase64: "",
      mimeType
    });
  }
}
