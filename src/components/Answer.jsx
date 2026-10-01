import { useEffect, useState } from "react";

function Answer({ text, status }) {
  const [copied, setCopied] = useState(false);
  const hasAnswer = Boolean(text) && text !== "Thinking...";
  const isThinking = status === "thinking" || text === "Thinking...";
  const isError = status === "error";

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
      <div className={bodyClass}>
        {text || "Start listening. Suggested answers will show up here."}
      </div>
    </section>
  );
}

export default Answer;
