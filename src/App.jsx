import { useEffect, useRef, useState } from "react";
import Answer from "./components/Answer";
import Controls from "./components/Controls";
import Status from "./components/Status";
import Transcript from "./components/Transcript";
import { askLLM } from "./services/llm";
import SpeechRecognitionService from "./services/speechRecognition";

const MIN_QUESTION_LENGTH = 8;
const ASK_DEBOUNCE_MS = 900;

const ERROR_MESSAGES = {
  network:
    "Could not transcribe meeting audio. Check GROK_API_KEY / internet and try again.",
  "meeting-denied":
    "Meeting audio permission denied. Allow screen/audio capture and try again.",
  "meeting-capture":
    "Could not capture meeting audio. Make sure the meeting is playing sound, then try again.",
  "no-system-audio":
    "No system audio received. Play meeting sound through speakers/headphones and try again.",
  "meeting-ended":
    "Meeting audio capture stopped. Start again if you still need answers."
};

function App() {
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("idle");
  const [listening, setListening] = useState(false);
  const [speechReady, setSpeechReady] = useState(true);

  const speechRef = useRef(null);
  const finalsRef = useRef("");
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const requestIdRef = useRef(0);
  const requestAnswerRef = useRef(null);

  async function requestAnswer(question) {
    const cleaned = question.trim();

    if (cleaned.length < MIN_QUESTION_LENGTH) {
      return;
    }

    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setStatus("thinking");
    setAnswer("Thinking...");

    try {
      const nextAnswer = await askLLM(cleaned, {
        signal: controller.signal
      });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setAnswer(nextAnswer);
      setStatus(speechRef.current?.isListening ? "listening" : "idle");
    } catch (error) {
      if (error?.name === "AbortError" || requestId !== requestIdRef.current) {
        return;
      }

      console.error(error);
      setAnswer(error.message || "Failed to get AI answer");
      setStatus("error");
    }
  }

  requestAnswerRef.current = requestAnswer;

  useEffect(() => {
    let speech;

    try {
      speech = new SpeechRecognitionService();
    } catch (error) {
      console.error(error);
      setSpeechReady(false);
      setStatus("error");
      setAnswer(
        "Meeting audio capture is not available in this environment."
      );
      return undefined;
    }

    speechRef.current = speech;

    speech.onStatusChange = (next) => {
      if (next === "listening" || next === "restarting") {
        setListening(true);
      }

      if (next === "idle") {
        setListening(false);
      }

      setStatus((current) =>
        current === "thinking" && next === "listening" ? current : next
      );
    };

    speech.onError = (error) => {
      setAnswer(ERROR_MESSAGES[error] || ERROR_MESSAGES.network);
      setStatus("error");
      if (error === "meeting-ended") {
        setListening(false);
      }
    };

    speech.onTranscript = ({ interim, finalText }) => {
      if (finalText) {
        finalsRef.current = `${finalsRef.current} ${finalText}`
          .replace(/\s+/g, " ")
          .trim();
      }

      setTranscript([finalsRef.current, interim].filter(Boolean).join(" "));
    };

    speech.onFinalTranscript = (text) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        void requestAnswerRef.current?.(text);
      }, ASK_DEBOUNCE_MS);
    };

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      abortRef.current?.abort();
      speech.stop();
      speechRef.current = null;
    };
  }, []);

  const clearTranscript = () => {
    finalsRef.current = "";
    setTranscript("");
  };

  const startListening = async () => {
    clearTranscript();
    setAnswer("");
    setStatus("listening");
    setListening(true);

    try {
      await speechRef.current?.start();
    } catch (error) {
      console.error(error);
      setListening(false);
      setStatus("error");

      const code = error?.code;
      setAnswer(
        (code && ERROR_MESSAGES[code]) || ERROR_MESSAGES["meeting-capture"]
      );
    }
  };

  const stopListening = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    abortRef.current?.abort();
    speechRef.current?.stop();
    setListening(false);
    setStatus("idle");
  };

  const hotkey =
    window.electronAPI?.shortcuts?.toggleOverlay || "Ctrl+Shift+H";

  return (
    <div className="app">
      <header className="header drag-region">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <div className="brand-copy">
            <h1>Interview Copilot</h1>
            <p>Listens to meeting audio · hidden from share</p>
          </div>
        </div>
        <Status status={status} />
      </header>

      <Answer text={answer} status={status} />
      <Transcript text={transcript} onClear={clearTranscript} />

      <div className="capture-bar no-drag">
        <p className="source-hint">
          Captures teammate voices from meeting system audio — use headphones
          to avoid picking up yourself
        </p>
        <Controls
          listening={listening}
          onStart={startListening}
          onStop={stopListening}
          disabled={!speechReady}
        />
      </div>

      <p className="footer-hint no-drag">
        Toggle overlay <kbd>{hotkey}</kbd>
        {" · "}Meeting audio · Whisper transcription
      </p>
    </div>
  );
}

export default App;
