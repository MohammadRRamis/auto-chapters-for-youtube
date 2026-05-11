import "./style.css"

function IndexPopup() {
  return (
    <div
      className="plasmo-w-[340px] plasmo-overflow-hidden plasmo-rounded-[24px] plasmo-border plasmo-border-[#e5e5e5] plasmo-bg-white plasmo-text-[#0f0f0f] plasmo-shadow-[0_18px_48px_rgba(15,15,15,0.12)]"
      style={{ fontFamily: '"Roboto", "Segoe UI", Arial, sans-serif' }}>
      <div className="plasmo-bg-[linear-gradient(180deg,#fff7f7_0%,#ffffff_72%)] plasmo-px-5 plasmo-pb-4 plasmo-pt-5">
        <span className="plasmo-inline-flex plasmo-rounded-full plasmo-bg-[#ffeded] plasmo-px-3 plasmo-py-1 plasmo-text-[11px] plasmo-font-semibold plasmo-uppercase plasmo-tracking-[0.08em] plasmo-text-[#cc0000]">
          Auto Chapters for YouTube
        </span>
        <h1 className="plasmo-mt-4 plasmo-text-[25px] plasmo-font-bold plasmo-leading-[1.15] plasmo-text-[#0f0f0f]">
          Generate chapters only when YouTube does not already have them.
        </h1>
        <p className="plasmo-mt-3 plasmo-text-sm plasmo-leading-6 plasmo-text-[#606060]">
          On supported watch pages, the extension adds a native-looking Generate
          Chapters action beside YouTube&apos;s own controls, opens Gemini with
          the current video prepared, and brings the result back into YouTube.
        </p>
      </div>

      <div className="plasmo-grid plasmo-gap-3 plasmo-px-5 plasmo-pb-5">
        <div className="plasmo-rounded-[18px] plasmo-border plasmo-border-[#e5e5e5] plasmo-bg-[#fafafa] plasmo-p-4">
          <p className="plasmo-text-xs plasmo-font-semibold plasmo-uppercase plasmo-tracking-[0.08em] plasmo-text-[#cc0000]">
            What it adds
          </p>
          <p className="plasmo-mt-2 plasmo-text-sm plasmo-leading-6 plasmo-text-[#303030]">
            A chapter action chip, a timeline overlay, and a watch-page chapter
            panel for videos that need a fallback chapter experience.
          </p>
        </div>

        <div className="plasmo-grid plasmo-gap-2 plasmo-rounded-[18px] plasmo-bg-[#0f0f0f] plasmo-p-4 plasmo-text-white">
          <p className="plasmo-text-xs plasmo-font-semibold plasmo-uppercase plasmo-tracking-[0.08em] plasmo-text-[#ffb3b3]">
            How it works
          </p>
          <p className="plasmo-text-sm plasmo-leading-6 plasmo-text-white/88">
            Click the page button on a video without native chapters. Gemini
            drafts the timestamps, and the extension restores them as a
            YouTube-style chapter UI.
          </p>
        </div>

        <div className="plasmo-flex plasmo-items-start plasmo-justify-between plasmo-rounded-[18px] plasmo-border plasmo-border-[#e5e5e5] plasmo-bg-white plasmo-p-4">
          <div>
            <p className="plasmo-text-sm plasmo-font-semibold plasmo-text-[#0f0f0f]">
              No API key setup
            </p>
            <p className="plasmo-mt-1 plasmo-text-sm plasmo-leading-6 plasmo-text-[#606060]">
              The workflow runs through Gemini in your browser. If a video
              already has native chapters, the extension stays out of the way.
            </p>
          </div>
          <span className="plasmo-ml-4 plasmo-inline-flex plasmo-shrink-0 plasmo-rounded-full plasmo-bg-[#ff0033] plasmo-px-3 plasmo-py-1 plasmo-text-xs plasmo-font-semibold plasmo-text-white">
            Native feel
          </span>
        </div>
      </div>
    </div>
  )
}

export default IndexPopup
