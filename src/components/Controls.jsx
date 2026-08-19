function Controls({ listening, onStart, onStop, disabled }) {
  return (
    <div className="controls no-drag">
      <button
        type="button"
        className={`mic-button${listening ? " is-live" : ""}`}
        onClick={listening ? onStop : onStart}
        disabled={disabled}
        aria-pressed={listening}
      >
        <span className="mic-icon" aria-hidden="true" />
        {listening ? "Stop listening" : "Capture meeting audio"}
      </button>
    </div>
  );
}

export default Controls;
