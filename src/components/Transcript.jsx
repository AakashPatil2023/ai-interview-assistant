function Transcript({ text, onClear }) {
  return (
    <section className="panel transcript-panel">
      <div className="panel-head">
        <h2>Transcript</h2>
        <div className="panel-actions">
          <button
            type="button"
            className="ghost-btn"
            onClick={onClear}
            disabled={!text}
          >
            Clear
          </button>
        </div>
      </div>
      <div className={`panel-body${!text ? " is-placeholder" : ""}`}>
        {text || "Speech from the meeting will show up here."}
      </div>
    </section>
  );
}

export default Transcript;
