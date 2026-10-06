import { envValue, getApiKey, normalizeBase64 } from "./llm-config.js";
import { requestJson } from "./llm-request.js";
import { SYSTEM_PROMPT, withScreenContext } from "./prompt.js";

export async function askOllama(question, options = {}) {
  const apiKey = getApiKey("ollama");
  if (!apiKey) {
    throw new Error("OLLAMA_API_KEY is not set in .env");
  }

  const imageBase64 = normalizeBase64(options.imageBase64);
  const model = (imageBase64 && envValue("OLLAMA_VISION_MODEL")) || envValue("OLLAMA_MODEL") || "kimi-k3";
  const data = await requestJson("Ollama", "https://ollama.com/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      stream: false,
      options: { temperature: 0.35, num_predict: 4096 },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: withScreenContext(question, Boolean(imageBase64)),
          ...(imageBase64 ? { images: [imageBase64] } : {})
        }
      ]
    })
  });

  const answer = data?.message?.content?.trim();
  if (!answer) {
    throw new Error("Ollama returned an empty answer");
  }
  return answer;
}
