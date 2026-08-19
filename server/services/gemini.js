import { SYSTEM_PROMPT } from "./prompt.js";

export async function askGemini(question) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in .env");
  }

  const model =
    process.env.GEMINI_MODEL || "gemini-2.0-flash";

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
          parts: [{ text: question }]
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
    const message =
      data?.error?.message || "Gemini request failed";
    throw new Error(message);
  }

  const answer =
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("\n")
      ?.trim();

  if (!answer) {
    throw new Error("Gemini returned an empty answer");
  }

  return answer;
}
