const LABELS = {
  idle: "Ready",
  listening: "Listening",
  restarting: "Reconnecting",
  thinking: "Thinking",
  error: "Needs attention"
};

function Status({ status }) {
  const key = LABELS[status] ? status : "idle";

  return (
    <div className={`status-pill status-${key}`} role="status" aria-live="polite">
      <span className="dot" aria-hidden="true" />
      {LABELS[key]}
    </div>
  );
}

export default Status;
