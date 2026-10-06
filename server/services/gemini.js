import { envValue, getApiKey, normalizeBase64 } from "./llm-config.js";
import { requestJson } from "./llm-request.js";
import { SYSTEM_PROMPT, withScreenContext } from "./prompt.js";

export async function askGemini(question, options = {}) {
  const apiKey = getApiKey("gemini");
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in .env");
  }

  const imageBase64 = normalizeBase64(options.imageBase64);
  const model = (imageBase64 && envValue("GEMINI_VISION_MODEL")) || envValue("GEMINI_MODEL") || "gemini-3.8-flash";
  const parts = [{ text: withScreenContext(question, Boolean(imageBase64)) }];
  if (imageBase64) {
    parts.push({
      inline_data: { mime_type: options.mimeType || "image/jpeg", data: imageBase64 }
    });
  }

  const data = await requestJson("Gemini", `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts }],
      generationConfig: { temperature: 1, maxOutputTokens: 4096 }
    })
  });

  const answer = data?.candidates?.[0]?.content?.parts
    ?.filter((part) => !part.thought)
    .map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    .trim();

  if (!answer) {
    throw new Error("Gemini returned an empty answer");
  }
  return answer;
}
