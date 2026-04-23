import "./style.css"

function IndexPopup() {
  return (
    <div
      className="plasmo-w-[320px] plasmo-rounded-[28px] plasmo-bg-slate-950 plasmo-p-5 plasmo-text-slate-50"
      style={{ fontFamily: '"IBM Plex Sans", "Segoe UI", sans-serif' }}>
      <p className="plasmo-text-xs plasmo-uppercase plasmo-tracking-[0.24em] plasmo-text-cyan-300/80">
        Auto Chapters for YouTube
      </p>
      <h1
        className="plasmo-mt-3 plasmo-text-2xl plasmo-leading-tight plasmo-text-white"
        style={{ fontFamily: '"DM Serif Display", Georgia, serif' }}>
        Generate timestamps and chapters in one click.
      </h1>
      <p className="plasmo-mt-3 plasmo-text-sm plasmo-leading-6 plasmo-text-slate-300">
        The extension adds a button beside YouTube&apos;s action row, opens
        Gemini in a new tab, and generates fallback chapters for videos that do
        not already include them, without asking for any API keys.
      </p>
    </div>
  )
}

export default IndexPopup
