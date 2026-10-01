function ScreenCapture({ preview, status }) {
  const label =
    status === "live"
      ? "Live"
      : status === "error"
        ? "Failed"
        : status === "unavailable"
          ? "Desktop only"
          : "Waiting";

  return (
    <section className="screen-strip no-drag">
      <div className="screen-frame">
        {preview ? (
          <img src={preview} alt="Latest screen capture" />
        ) : (
          <div className="screen-empty">No shot</div>
        )}
      </div>
      <div className="screen-copy">
        <h2>Screen</h2>
        <p>{label}</p>
      </div>
    </section>
  );
}

export default ScreenCapture;
