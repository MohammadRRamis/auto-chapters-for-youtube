import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  test as base,
  chromium,
  expect,
  type BrowserContext,
  type Page,
  type Worker
} from "@playwright/test"

import {
  ACTIVE_GEMINI_SUMMARY_KEY,
  GEMINI_VIDEO_CHAPTERS_KEY,
  PENDING_GEMINI_SUMMARY_KEY,
  type PendingGeminiSummaryRequest,
  type StoredGeminiChapterResults
} from "../src/gemini-workflow"

type RuntimeErrors = {
  consoleErrors: string[]
  pageErrors: string[]
}

const projectRoot = path.resolve(__dirname, "..")
const extensionPath = path.join(projectRoot, "build", "chrome-mv3-prod")

const createYoutubeHtml = (options: { nativeTimestamps: boolean }) => {
  const description = options.nativeTimestamps
    ? `
      <div id="description">
        <a href="?t=0">0:00</a>
        <a href="?t=60">1:00</a>
        <a href="?t=120">2:00</a>
      </div>
    `
    : '<div id="description">No native timestamps on this mock video.</div>'

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Mock YouTube Watch Page</title>
        <style>
          body {
            font-family: sans-serif;
            margin: 0;
            padding: 24px;
          }

          #above-the-fold,
          #meta-contents,
          #secondary,
          ytd-watch-metadata,
          #top-level-buttons-computed,
          #description {
            display: block;
            width: 860px;
          }

          #top-level-buttons-computed {
            display: flex;
            align-items: center;
            gap: 8px;
            min-height: 40px;
          }

          video {
            display: block;
            width: 640px;
            height: 360px;
            background: black;
          }

          .html5-video-player {
            position: relative;
            width: 640px;
            margin-bottom: 16px;
            background: black;
          }

          .ytp-chrome-bottom {
            position: absolute;
            inset: auto 0 0 0;
            padding: 0 12px 12px;
            box-sizing: border-box;
          }

          .ytp-progress-bar-container {
            position: relative;
            width: 616px;
            height: 12px;
            margin-bottom: 8px;
          }

          .ytp-progress-bar {
            position: absolute;
            inset: 3px 0;
          }

          .ytp-chapters-container,
          .ytp-chapter-hover-container {
            position: relative;
            height: 100%;
          }

          .ytp-progress-list {
            position: relative;
            height: 6px;
            overflow: hidden;
            border-radius: 3px;
            background: rgba(255, 255, 255, 0.22);
          }

          .ytp-chrome-controls,
          .ytp-left-controls {
            display: flex;
            align-items: center;
          }

          .ytp-left-controls {
            gap: 10px;
            color: white;
          }

          .ytp-time-display {
            display: block;
            line-height: 40px;
            white-space: nowrap;
          }

          .ytp-time-wrapper {
            display: inline;
          }

          .ytp-button {
            border: 0;
            background: transparent;
            color: inherit;
            cursor: pointer;
          }

          .html5-video-player {
            width: 640px;
          }

          .ytp-progress-bar {
            position: relative;
            width: 600px;
            height: 6px;
          }

          .ytp-chapters-container,
          .ytp-chapter-hover-container,
          .ytp-progress-list {
            height: 100%;
          }

          #secondary {
            min-height: 24px;
          }

          #description {
            margin-top: 16px;
            min-height: 24px;
          }
        </style>
      </head>
      <body>
        <div class="html5-video-player">
          <video></video>
          <div class="ytp-chrome-bottom">
            <div class="ytp-progress-bar-container">
              <div class="ytp-progress-bar">
                <div class="ytp-chapters-container">
                  <div class="ytp-chapter-hover-container">
                    <div class="ytp-progress-bar-padding"></div>
                    <div class="ytp-progress-list ytp-progress-bar-start ytp-progress-bar-end">
                      <div class="ytp-play-progress ytp-swatch-background-color"></div>
                      <div class="ytp-progress-linear-live-buffer"></div>
                      <div class="ytp-load-progress"></div>
                      <div class="ytp-hover-progress ytp-hover-progress-light"></div>
                      <div class="ytp-ad-progress-list"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="ytp-chrome-controls">
              <div class="ytp-left-controls">
                <button class="ytp-play-button ytp-button" type="button">Play</button>
                <div class="ytp-time-display notranslate">
                  <div class="ytp-time-wrapper ytp-time-wrapper-delhi">
                    <span class="ytp-time-current">0:00</span>
                    <span>/</span>
                    <span class="ytp-time-duration">5:00</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="ytp-tooltip-text-wrapper">
          <div class="ytp-tooltip-image"></div>
          <div class="ytp-tooltip-title"><span></span><div class="ytp-tooltip-keyboard-shortcut"></div></div>
          <div class="ytp-tooltip-bottom-text"><span class="ytp-tooltip-text"></span><div class="ytp-tooltip-keyboard-shortcut"></div></div>
          <div class="ytp-tooltip-progress-bar-pill"><div class="ytp-tooltip-progress-bar-pill-time-stamp">0:00</div><div class="ytp-tooltip-progress-bar-pill-title"></div></div>
        </div>
        <div id="above-the-fold">
          <ytd-watch-metadata>
            <div id="top-level-buttons-computed">
              <button type="button">Like</button>
            </div>
          </ytd-watch-metadata>
        </div>
        <div id="meta-contents"></div>
        <div id="secondary"></div>
        ${description}
        <script>
          const video = document.querySelector('video')
          const currentTime = document.querySelector('.ytp-time-current')
          const progressBar = document.querySelector('.ytp-progress-bar')
          const tooltipTimestamp = document.querySelector('.ytp-tooltip-progress-bar-pill-time-stamp')

          Object.defineProperty(video, 'duration', {
            configurable: true,
            get: () => 300
          })

          const updateTimeDisplay = () => {
            const minutes = Math.floor(video.currentTime / 60)
            const seconds = String(Math.floor(video.currentTime % 60)).padStart(2, '0')

            currentTime.textContent = minutes + ':' + seconds
          }

          video.addEventListener('timeupdate', updateTimeDisplay)
          video.addEventListener('seeking', updateTimeDisplay)
          progressBar.addEventListener('mousemove', (event) => {
            const rect = progressBar.getBoundingClientRect()
            const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
            const hoveredSeconds = Math.floor(ratio * 300)
            const minutes = Math.floor(hoveredSeconds / 60)
            const seconds = String(hoveredSeconds % 60).padStart(2, '0')

            tooltipTimestamp.textContent = minutes + ':' + seconds
          })
          progressBar.addEventListener('mouseleave', () => {
            tooltipTimestamp.textContent = ''
          })
          updateTimeDisplay()
        </script>
      </body>
    </html>
  `
}

const installMockRoutes = async (context: BrowserContext) => {
  await context.route("https://www.youtube.com/watch**", async (route) => {
    const url = new URL(route.request().url())
    const nativeTimestamps = url.searchParams.get("v") === "native-video"

    await route.fulfill({
      body: createYoutubeHtml({ nativeTimestamps }),
      contentType: "text/html"
    })
  })
}

const getExtensionWorker = async (context: BrowserContext) => {
  let [serviceWorker] = context.serviceWorkers()

  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent("serviceworker")
  }

  return serviceWorker as Worker
}

const getLocalStorageValue = async <TValue>(
  context: BrowserContext,
  key: string
) => {
  const serviceWorker = await getExtensionWorker(context)

  return (await serviceWorker.evaluate(async (storageKey) => {
    return await new Promise((resolve) => {
      chrome.storage.local.get([storageKey], (result) => {
        resolve(result[storageKey])
      })
    })
  }, key)) as TValue | undefined
}

const setLocalStorageValue = async <TValue>(
  context: BrowserContext,
  key: string,
  value: TValue
) => {
  const serviceWorker = await getExtensionWorker(context)

  await serviceWorker.evaluate(
    async ({ storageKey, storageValue }) => {
      await new Promise<void>((resolve) => {
        chrome.storage.local.set({ [storageKey]: storageValue }, () => {
          resolve()
        })
      })
    },
    { storageKey: key, storageValue: value }
  )
}

const attachRuntimeErrorCollection = (
  context: BrowserContext,
  runtimeErrors: RuntimeErrors
) => {
  const instrumentPage = (page: Page) => {
    page.on("console", (message) => {
      const locationUrl = message.location().url ?? ""

      if (
        message.type() === "error" &&
        (locationUrl.startsWith("chrome-extension://") ||
          message.text().includes("chrome-extension://"))
      ) {
        runtimeErrors.consoleErrors.push(message.text())
      }
    })

    page.on("pageerror", (error) => {
      if ((error.stack ?? error.message).includes("chrome-extension://")) {
        runtimeErrors.pageErrors.push(error.message)
      }
    })
  }

  context.pages().forEach(instrumentPage)
  context.on("page", instrumentPage)
}

const assertNoRuntimeErrors = (runtimeErrors: RuntimeErrors) => {
  expect(
    runtimeErrors.consoleErrors,
    `Unexpected console errors: ${runtimeErrors.consoleErrors.join("\n")}`
  ).toEqual([])

  expect(
    runtimeErrors.pageErrors,
    `Unexpected page errors: ${runtimeErrors.pageErrors.join("\n")}`
  ).toEqual([])
}

const test = base.extend<{
  context: BrowserContext
  runtimeErrors: RuntimeErrors
}>({
  context: async ({}, use) => {
    const userDataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "summarize-youtube-videos-")
    )
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ],
      headless: true
    })

    let [serviceWorker] = context.serviceWorkers()

    if (!serviceWorker) {
      serviceWorker = await context.waitForEvent("serviceworker")
    }

    await use(context)
    await context.close()
    await fs.rm(userDataDir, { force: true, recursive: true })
  },
  runtimeErrors: async ({ context }, use) => {
    const runtimeErrors: RuntimeErrors = {
      consoleErrors: [],
      pageErrors: []
    }

    attachRuntimeErrorCollection(context, runtimeErrors)

    await use(runtimeErrors)
  }
})

test("shows the Gemini button only when native chapters are absent", async ({
  context,
  runtimeErrors
}) => {
  await installMockRoutes(context)

  const fallbackPage = await context.newPage()

  await fallbackPage.goto("https://www.youtube.com/watch?v=fallback-video")

  await expect(
    fallbackPage.locator("#plasmo-summarize-youtube-button")
  ).toBeVisible()

  const nativePage = await context.newPage()

  await nativePage.goto("https://www.youtube.com/watch?v=native-video")

  await expect(
    nativePage.locator("#plasmo-summarize-youtube-button")
  ).toHaveCount(0)

  await setLocalStorageValue<StoredGeminiChapterResults>(
    context,
    GEMINI_VIDEO_CHAPTERS_KEY,
    {
      "native-video": {
        capturedAt: Date.now(),
        chapters: [{ start: "0:00", title: "Should stay hidden" }],
        requestId: "native-request",
        summary: "Native chapters should suppress fallback UI.",
        videoId: "native-video",
        videoUrl: "https://www.youtube.com/watch?v=native-video"
      }
    }
  )

  await expect(nativePage.locator(".plasmo-ai-chapters-panel")).toHaveCount(0)

  assertNoRuntimeErrors(runtimeErrors)
})

test("opens Gemini with a structured prompt and renders stored native-style chapters", async ({
  context,
  runtimeErrors
}) => {
  await installMockRoutes(context)

  const youtubePage = await context.newPage()

  await youtubePage.goto("https://www.youtube.com/watch?v=fallback-video")

  const summaryButton = youtubePage.locator("#plasmo-summarize-youtube-button")

  await expect(summaryButton).toBeVisible()

  const geminiPagePromise = context.waitForEvent("page")

  await summaryButton.click()

  const geminiPage = await geminiPagePromise

  await geminiPage.waitForURL(/https:\/\/gemini\.google\.com\/app/)

  const request =
    (await getLocalStorageValue<PendingGeminiSummaryRequest>(
      context,
      ACTIVE_GEMINI_SUMMARY_KEY
    )) ??
    (await getLocalStorageValue<PendingGeminiSummaryRequest>(
      context,
      PENDING_GEMINI_SUMMARY_KEY
    ))

  expect(request).toBeDefined()
  expect(request?.videoId).toBe("fallback-video")
  expect(request?.videoUrl).toBe(
    "https://www.youtube.com/watch?v=fallback-video"
  )
  expect(request?.prompt).toContain("Summarize this YouTube video.")
  expect(request?.prompt).toContain("CHAPTERS_JSON")
  expect(request?.prompt).toContain(
    `Use this exact requestId value in the JSON: ${request?.requestId}`
  )

  await setLocalStorageValue<StoredGeminiChapterResults>(
    context,
    GEMINI_VIDEO_CHAPTERS_KEY,
    {
      "fallback-video": {
        capturedAt: Date.now(),
        chapters: [
          { start: "0:00", title: "Opening" },
          { end: "2:10", start: "1:15", title: "Deep dive" }
        ],
        requestId: request?.requestId ?? "fallback-request",
        summary: "Mock Gemini overview for fallback chapters.",
        videoId: "fallback-video",
        videoUrl: "https://www.youtube.com/watch?v=fallback-video"
      }
    }
  )

  const chapterToggle = youtubePage.locator(
    "#plasmo-summarize-youtube-chapter-toggle"
  )

  await expect(chapterToggle).toBeVisible({
    timeout: 15_000
  })
  await expect(
    youtubePage.locator(
      ".ytp-time-display + #plasmo-summarize-youtube-chapter-toggle-host"
    )
  ).toBeVisible()
  await expect(
    youtubePage.locator(
      "#plasmo-summarize-youtube-chapter-timeline .plasmo-ai-chapter-segment"
    )
  ).toHaveCount(2)
  await expect(
    youtubePage.locator(
      ".ytp-chapters-container #plasmo-summarize-youtube-chapter-timeline"
    )
  ).toBeVisible()
  await expect(
    youtubePage.locator(
      ".ytp-chapters-container > .ytp-chapter-hover-container:not(#plasmo-summarize-youtube-chapter-timeline)"
    )
  ).toBeHidden()

  await youtubePage
    .locator(".ytp-tooltip-progress-bar-pill-time-stamp")
    .evaluate((element) => {
      element.textContent = "1:40"
    })

  await expect(
    youtubePage.locator(".ytp-tooltip-progress-bar-pill-title")
  ).toHaveText("Deep dive")

  await chapterToggle.click()

  await expect(
    youtubePage.locator(
      "#plasmo-summarize-youtube-chapters-host ytd-engagement-panel-section-list-renderer"
    )
  ).toBeVisible()
  await expect(
    youtubePage.locator(".plasmo-ai-native-chapter-item")
  ).toHaveCount(2)
  await expect(
    youtubePage.locator(".plasmo-ai-native-panel-summary")
  ).toContainText("Mock Gemini overview for fallback chapters.")

  await youtubePage.locator(".plasmo-ai-native-chapter-item").nth(1).click()

  await expect
    .poll(async () => {
      return youtubePage.locator("video").evaluate((element) => {
        return Math.round((element as HTMLVideoElement).currentTime)
      })
    })
    .toBe(75)

  await geminiPage.close()

  assertNoRuntimeErrors(runtimeErrors)
})
