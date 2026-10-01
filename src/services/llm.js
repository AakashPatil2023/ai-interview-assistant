import { apiUrl } from "./api";

export async function askLLM(question, { signal, imageBase64, mimeType } = {}) {
  const response = await fetch(apiUrl("/api/ask"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      question,
      imageBase64: imageBase64 || undefined,
      mimeType: imageBase64 ? mimeType || "image/jpeg" : undefined
    }),
    signal
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || `Request failed (${response.status})`
    );
  }

  return data.answer;
}
