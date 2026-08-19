function Transcript({ text, onClear }) {
  return (
    <section className="panel transcript-panel">
      <div className="panel-head">
        <h2>Heard</h2>
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
        {text || "Waiting for teammate speech from the meeting…"}
      </div>
    </section>
  );
}

export default Transcript;
