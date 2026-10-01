import { Router } from "express";
import { askGemini } from "../services/gemini.js";
import { askGrok } from "../services/grok.js";
import { transcribeAudio } from "../services/whisper.js";

const router = Router();

function getProvider() {
  return (process.env.LLM_PROVIDER || "grok").toLowerCase();
}

async function getAnswer(question, options) {
  const provider = getProvider();

  if (provider === "gemini") {
    return askGemini(question, options);
  }

  return askGrok(question, options);
}

router.post("/ask", async (req, res) => {
  try {
    const question = String(req.body?.question || "").trim();
    const imageBase64 = String(req.body?.imageBase64 || "");
    const mimeType = String(req.body?.mimeType || "image/jpeg");

    if (!question) {
      return res.status(400).json({
        error: "question is required"
      });
    }

    if (question.length < 3) {
      return res.status(400).json({
        error: "question is too short"
      });
    }

    const answer = await getAnswer(question, {
      imageBase64,
      mimeType
    });

    return res.json({ answer, provider: getProvider() });
  } catch (error) {
    console.error("AI /ask error:", error.message);
    return res.status(500).json({
      error: error.message || "Failed to get AI answer"
    });
  }
});

router.post("/transcribe", async (req, res) => {
  try {
    const audioBase64 = String(req.body?.audioBase64 || "");
    const mimeType = String(req.body?.mimeType || "audio/webm");

    if (!audioBase64) {
      return res.status(400).json({
        error: "audioBase64 is required"
      });
    }

    const buffer = Buffer.from(audioBase64, "base64");

    if (buffer.length < 256) {
      return res.json({ text: "" });
    }

    const extension = mimeType.includes("mp4")
      ? "mp4"
      : mimeType.includes("ogg")
        ? "ogg"
        : mimeType.includes("wav")
          ? "wav"
          : "webm";

    const text = await transcribeAudio({
      buffer,
      mimeType,
      filename: `speech.${extension}`
    });

    return res.json({ text });
  } catch (error) {
    console.error("AI /transcribe error:", error.message);
    return res.status(500).json({
      error: error.message || "Failed to transcribe audio"
    });
  }
});

export default router;
