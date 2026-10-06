import { useEffect, useRef, useState } from "react";

function Answer({ text, status }) {
  const [copied, setCopied] = useState(false);
  const bodyRef = useRef(null);
  const hasAnswer = Boolean(text) && text !== "Thinking...";
  const isThinking = status === "thinking" || text === "Thinking...";
  const isError = status === "error";

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [text]);

  useEffect(() => {
    return window.electronAPI?.onScrollAnswer?.((direction) => {
      const body = bodyRef.current;
      if (!body || (direction !== -1 && direction !== 1)) {
        return;
      }

      body.scrollBy({
        top: direction * Math.max(80, body.clientHeight * 0.75),
        behavior: "smooth"
      });
    });
  }, []);

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const copyAnswer = async () => {
    if (!hasAnswer || isThinking) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch (error) {
      console.error(error);
    }
  };

  let bodyClass = "panel-body";
  if (!text) {
    bodyClass += " is-placeholder";
  } else if (isThinking) {
    bodyClass += " is-thinking";
  } else if (isError) {
    bodyClass += " is-error";
  }

  return (
    <section className="panel answer-panel">
      <div className="panel-head">
        <h2>Suggested answer</h2>
        <div className="panel-actions">
          <button
            type="button"
            className={`ghost-btn${copied ? " copied" : ""}`}
            onClick={copyAnswer}
            disabled={!hasAnswer || isThinking}
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div className={bodyClass} ref={bodyRef}>
        {text || "Start listening. Suggested answers will show up here."}
      </div>
    </section>
  );
}

export default Answer;
