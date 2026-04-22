# Summarize YouTube Videos

Browser extension that adds an AI summary workflow to YouTube watch pages.

When a video does not already include native YouTube chapters, the extension adds a summary button to the watch page. One click opens Gemini with a structured prompt for the current video, then captures the response and renders a fallback chapter experience back on YouTube.

## What it does

- Adds a summary button to eligible YouTube watch pages.
- Opens Gemini with a prebuilt prompt for the current video URL.
- Stores the active request and captured result in extension storage.
- Renders a fallback chapter toggle, timeline segments, and a right-rail chapter panel on YouTube.
- Stays out of the way when the video already exposes native chapter links.

## How it works

1. Visit a YouTube watch page without native chapters.
2. Click the extension's summary button.
3. The extension opens Gemini in a new tab and prepares a structured prompt.
4. Gemini returns an overview plus chapter JSON.
5. The extension stores that result and injects a YouTube-style fallback chapter UI for the video.

The current implementation runs entirely in the browser extension. There is no backend service in this repository.

## Tech stack

- Plasmo
- TypeScript
- React
- Tailwind CSS
- Playwright

## Development

### Prerequisites

- Node.js 18+
- pnpm
- Chromium or Chrome for local extension testing

### Install dependencies

```bash
pnpm install
```

### Start the extension in development mode

```bash
pnpm dev
```

Then load the unpacked extension in Chrome:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select `build/chrome-mv3-dev`.

After that, open a YouTube watch page and reload the extension when needed.

## Production build

Create a production build:

```bash
pnpm build
```

Package the extension for distribution:

```bash
pnpm package
```

Build artifacts are generated under `build/`.

## Testing

End-to-end coverage is provided with Playwright.

```bash
pnpm build
pnpm test:e2e
```

The current tests cover the main regression path:

- the summary button only appears when fallback UI is needed
- Gemini is opened with the expected structured prompt
- stored summary/chapter results are rendered back into a YouTube-style chapter interface

## Project structure

```text
src/
  background.ts         Background message handling and tab opening
  content.tsx           YouTube and Gemini page integration
  gemini-workflow.ts    Prompt construction and shared workflow types
  popup.tsx             Extension popup UI
tests/
  extension.spec.ts     Playwright end-to-end tests
```

## Notes

- The extension currently targets `https://www.youtube.com/*` and `https://gemini.google.com/*`.
- It uses extension storage to keep pending requests, active requests, and captured chapter results.
- `keys.json` is for store submission workflows. Do not commit real store credentials.

## Contributing

Issues and pull requests are welcome. If you plan to make a larger change, open an issue first so the scope and direction can be discussed before implementation.

## Status

This project is actively being developed. Expect iteration on prompt quality, chapter extraction reliability, and broader browser packaging.
