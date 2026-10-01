import { SYSTEM_PROMPT, withScreenContext } from "./prompt.js";

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

async function completeGemini({ url, question, imageBase64, mimeType }) {
  const parts = [{ text: withScreenContext(question, Boolean(imageBase64)) }];

  if (imageBase64) {
    parts.push({
      inline_data: {
        mime_type: mimeType || "image/jpeg",
        data: imageBase64
      }
    });
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: [
        {
          role: "user",
          parts
        }
      ],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 350
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    const message = data?.error?.message || "Gemini request failed";
    throw new Error(message);
  }

  const answer = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join("\n")
    ?.trim();

  if (!answer) {
    throw new Error("Gemini returned an empty answer");
  }

  return answer;
}

export async function askGemini(question, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in .env");
  }

  const model =
    process.env.GEMINI_MODEL || "gemini-2.0-flash";

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const imageBase64 = normalizeBase64(options.imageBase64);
  const mimeType = options.mimeType || "image/jpeg";

  if (!imageBase64) {
    return completeGemini({
      url,
      question,
      imageBase64: "",
      mimeType
    });
  }

  try {
    return await completeGemini({
      url,
      question,
      imageBase64,
      mimeType
    });
  } catch (error) {
    console.error("Vision request failed, retrying text-only:", error.message);
    return completeGemini({
      url,
      question,
      imageBase64: "",
      mimeType
    });
  }
}
