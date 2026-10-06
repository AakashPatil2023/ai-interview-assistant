import { envValue, getApiKey, normalizeBase64 } from "./llm-config.js";
import { requestJson } from "./llm-request.js";
import { SYSTEM_PROMPT, withScreenContext } from "./prompt.js";

export async function askOpenAI(question, options = {}) {
  const apiKey = getApiKey("openai");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in .env");
  }

  const imageBase64 = normalizeBase64(options.imageBase64);
  const model = (imageBase64 && envValue("OPENAI_VISION_MODEL")) || envValue("OPENAI_MODEL") || "gpt-6-astra";
  const content = [{ type: "input_text", text: withScreenContext(question, Boolean(imageBase64)) }];
  if (imageBase64) {
    content.push({
      type: "input_image",
      image_url: `data:${options.mimeType || "image/jpeg"};base64,${imageBase64}`,
      detail: "auto"
    });
  }

  const data = await requestJson("OpenAI", "https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      instructions: SYSTEM_PROMPT,
      input: [{ role: "user", content }],
      max_output_tokens: 4096,
      store: false,
      ...(/^(gpt-[56]|o[134])/.test(model)
        ? { reasoning: { effort: envValue("OPENAI_REASONING_EFFORT") || "medium" } }
        : {})
    })
  });

  const answer = data?.output
    ?.filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  if (!answer) {
    throw new Error("OpenAI returned an empty answer");
  }
  return answer;
}
