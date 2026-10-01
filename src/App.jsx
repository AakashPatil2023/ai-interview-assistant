import { useEffect, useRef, useState } from "react";
import Answer from "./components/Answer";
import Status from "./components/Status";
import { askLLM } from "./services/llm";
import SpeechRecognitionService from "./services/speechRecognition";

const MIN_QUESTION_LENGTH = 8;
const ASK_DEBOUNCE_MS = 900;
const SCREENSHOT_INTERVAL_MS = 3500;

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
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("idle");
  const [listening, setListening] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [opacity, setOpacity] = useState(() => {
    const saved = Number(localStorage.getItem("overlay-opacity"));
    if (Number.isFinite(saved) && saved >= 0.35 && saved <= 1) {
      return saved;
    }
    return 0.92;
  });

  const speechRef = useRef(null);
  const finalsRef = useRef("");
  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const requestIdRef = useRef(0);
  const requestAnswerRef = useRef(null);
  const screenRef = useRef(null);
  const heardAtRef = useRef(0);
  const startListeningRef = useRef(null);
  const stopListeningRef = useRef(null);
  const sendScreenshotRef = useRef(null);
  const answerRef = useRef("");
  const clearTranscriptRef = useRef(null);

  function rememberScreenshot(shot) {
    if (!shot?.base64) {
      return null;
    }

    screenRef.current = shot;
    return shot;
  }

  async function pullScreenshot() {
    if (!window.electronAPI?.captureScreenshot) {
      return screenRef.current;
    }

    try {
      const shot = await window.electronAPI.captureScreenshot();
      if (!shot?.base64) {
        return screenRef.current;
      }

      return rememberScreenshot(shot);
    } catch (error) {
      console.error(error);
      return screenRef.current;
    }
  }

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

    const shot = await pullScreenshot();

    if (requestId !== requestIdRef.current) {
      return;
    }

    try {
      const nextAnswer = await askLLM(cleaned, {
        signal: controller.signal,
        imageBase64: shot?.base64,
        mimeType: shot?.mimeType
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
  const pullScreenshotRef = useRef(pullScreenshot);
  pullScreenshotRef.current = pullScreenshot;

  useEffect(() => {
    let speech;

    try {
      speech = new SpeechRecognitionService();
    } catch (error) {
      console.error(error);
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

    speech.onTranscript = ({ finalText }) => {
      if (finalText) {
        finalsRef.current = `${finalsRef.current} ${finalText}`
          .replace(/\s+/g, " ")
          .trim();
      }
    };

    speech.onLevel = (rms) => {
      if (rms >= 0.008) {
        heardAtRef.current = Date.now();
        setHearing(true);
        return;
      }

      if (Date.now() - heardAtRef.current > 1600) {
        setHearing(false);
      }
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

  useEffect(() => {
    localStorage.setItem("overlay-opacity", String(opacity));
  }, [opacity]);

  useEffect(() => {
    const tick = () => {
      void pullScreenshotRef.current?.();
    };

    tick();
    const id = setInterval(tick, SCREENSHOT_INTERVAL_MS);

    return () => {
      clearInterval(id);
    };
  }, []);

  const clearTranscript = () => {
    finalsRef.current = "";
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

  async function sendScreenshot() {
    abortRef.current?.abort();

    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setStatus("thinking");
    setAnswer("Thinking...");

    const shot = await pullScreenshot();

    if (requestId !== requestIdRef.current) {
      return;
    }

    if (!shot?.base64) {
      setAnswer("Could not capture the screen. Open the desktop overlay and try again.");
      setStatus("error");
      return;
    }

    try {
      const nextAnswer = await askLLM(
        "Read the screenshot and answer the question, problem, or code shown on screen.",
        {
          signal: controller.signal,
          imageBase64: shot.base64,
          mimeType: shot.mimeType
        }
      );

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

  const stopListening = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    abortRef.current?.abort();
    speechRef.current?.stop();
    setListening(false);
    setHearing(false);
    setStatus("idle");
  };

  startListeningRef.current = startListening;
  stopListeningRef.current = stopListening;
  sendScreenshotRef.current = sendScreenshot;
  answerRef.current = answer;
  clearTranscriptRef.current = clearTranscript;

  useEffect(() => {
    const offListen = window.electronAPI?.onToggleListen?.(() => {
      if (speechRef.current?.isListening) {
        stopListeningRef.current?.();
        return;
      }

      void startListeningRef.current?.();
    });

    const offShot = window.electronAPI?.onSendScreenshot?.(() => {
      void sendScreenshotRef.current?.();
    });

    const offOpacity = window.electronAPI?.onOpacityChange?.((delta) => {
      setOpacity((current) => {
        const next = Math.round((current + delta) * 20) / 20;
        return Math.min(1, Math.max(0.35, next));
      });
    });

    const offCopy = window.electronAPI?.onCopyAnswer?.(() => {
      const text = String(answerRef.current || "").trim();
      if (!text || text === "Thinking...") {
        return;
      }

      void navigator.clipboard.writeText(text);
    });

    const offClear = window.electronAPI?.onClearTranscript?.(() => {
      clearTranscriptRef.current?.();
    });

    return () => {
      offListen?.();
      offShot?.();
      offOpacity?.();
      offCopy?.();
      offClear?.();
    };
  }, []);

  const shortcuts = window.electronAPI?.shortcuts || {};
  const hotkey = shortcuts.toggleOverlay || "Ctrl+Shift+H";
  const listenKey = shortcuts.toggleListen || "Alt+Shift+L";
  const shotKey = shortcuts.sendScreenshot || "Alt+Shift+S";
  const moveKey = shortcuts.move || "Alt+Shift+Arrows";
  const widthKey = shortcuts.width || "Alt+Shift+[ / ]";
  const heightKey = shortcuts.height || "Alt+Shift+PgUp / PgDn";
  const copyKey = shortcuts.copyAnswer || "Alt+Shift+C";

  return (
    <div className="app">
      <div className="shell" style={{ "--panel-alpha": opacity }}>
      <header className="header drag-region">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            <span />
          </div>
          <div className="brand-copy">
            <h1>Service Host IC</h1>
          </div>
        </div>
        <Status status={status} />
      </header>

      <Answer text={answer} status={status} />

      <div className="capture-bar no-drag">
        {listening && !hearing ? (
          <p className="source-hint">No meeting sound yet. Unmute the call.</p>
        ) : null}
        <p className="footer-hint">
          Listen <kbd>{listenKey}</kbd>
          {" · "}
          Shot <kbd>{shotKey}</kbd>
          {" · "}
          Hide <kbd>{hotkey}</kbd>
          <br />
          Move <kbd>{moveKey}</kbd>
          {" · "}
          Width <kbd>{widthKey}</kbd>
          {" · "}
          Height <kbd>{heightKey}</kbd>
          <br />
          Copy <kbd>{copyKey}</kbd>
        </p>
      </div>
      </div>
    </div>
  );
}

export default App;
