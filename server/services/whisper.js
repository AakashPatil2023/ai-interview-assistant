function getApiKey() {
  const raw = process.env.GROK_API_KEY || process.env.XAI_API_KEY || "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

export async function transcribeAudio({ buffer, mimeType, filename }) {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("GROK_API_KEY is not set in .env");
  }

  if (!apiKey.startsWith("gsk_")) {
    throw new Error(
      "Speech transcription needs a Groq API key (gsk_...). Browser speech does not work in Electron."
    );
  }

  const model =
    process.env.WHISPER_MODEL || "whisper-large-v3-turbo";

  const form = new FormData();
  form.append(
    "file",
    new Blob([buffer], { type: mimeType || "audio/webm" }),
    filename || "speech.webm"
  );
  form.append("model", model);
  form.append("response_format", "json");
  form.append("language", "en");
  form.append("temperature", "0");

  const response = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: form
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || "Transcription request failed"
    );
  }

  return String(data?.text || "").trim();
}
