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

const createYoutubeHtml = (options: {
  adOnlySecondaryRail?: boolean
  nativeTimestamps: boolean
}) => {
  const description = options.nativeTimestamps
    ? `
      <div id="description">
        <a href="?t=0">0:00</a>
        <a href="?t=60">1:00</a>
        <a href="?t=120">2:00</a>
      </div>
    `
    : '<div id="description">No native timestamps on this mock video.</div>'

  const secondaryMarkup = options.adOnlySecondaryRail
    ? `
        <div id="secondary">
          <div id="related">
            <div id="player-ads">Sponsored</div>
          </div>
        </div>
      `
    : '<div id="secondary"></div>'

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

          .ytp-chapter-container {
            box-sizing: border-box;
            height: 64px;
            padding-top: 8px;
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

          #player-ads {
            display: block;
            min-height: 180px;
            padding: 16px;
            border-radius: 16px;
            background: rgba(15, 23, 42, 0.08);
            color: #111827;
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
                <button class="ytp-mute-button ytp-button" type="button">Mute</button>
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
        ${secondaryMarkup}
        ${description}
        <script>
          if (!customElements.get('ytd-engagement-panel-section-list-renderer')) {
            customElements.define(
              'ytd-engagement-panel-section-list-renderer',
              class extends HTMLElement {
                connectedCallback() {
                  if (this.dataset.plasmoGenerated !== 'true') {
                    return
                  }

                  this.replaceChildren(
                    Object.assign(document.createElement('div'), {
                      className: 'style-scope ytd-engagement-panel-section-list-renderer',
                      id: 'header'
                    }),
                    Object.assign(document.createElement('div'), {
                      className: 'style-scope ytd-engagement-panel-section-list-renderer',
                      id: 'content'
                    }),
                    Object.assign(document.createElement('div'), {
                      className: 'style-scope ytd-engagement-panel-section-list-renderer',
                      id: 'footer'
                    })
                  )
                }
              }
            )
          }

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
    const videoId = url.searchParams.get("v")
    const nativeTimestamps = videoId === "native-video"

    await route.fulfill({
      body: createYoutubeHtml({
        adOnlySecondaryRail: videoId === "ad-rail-video",
        nativeTimestamps
      }),
      contentType: "text/html"
    })
  })
}

const triggerUnrelatedYoutubeMutation = async (page: Page) => {
  await page.evaluate(() => {
    const target =
      document.querySelector("#secondary") ??
      document.querySelector(".ytp-left-controls") ??
      document.body

    if (!target) {
      return
    }

    const marker = document.createElement("div")

    marker.textContent = "mutation-pulse"
    target.append(marker)
    marker.remove()
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
      path.join(os.tmpdir(), "auto-chapters-for-youtube-")
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
  expect(request?.prompt).toContain(
    "Generate timestamps and chapters for this YouTube video."
  )
  expect(request?.prompt).toContain("CHAPTERS_JSON")
  expect(request?.requestId).toBeTruthy()
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

  await youtubePage
    .locator("#plasmo-summarize-youtube-chapter-toggle")
    .evaluate((element) => {
      ;(
        element as HTMLElement & { __plasmoIdentity?: string }
      ).__plasmoIdentity = "toggle"
    })

  await triggerUnrelatedYoutubeMutation(youtubePage)

  await expect
    .poll(async () => {
      return youtubePage.evaluate(() => {
        return (
          (
            document.querySelector(
              "#plasmo-summarize-youtube-chapter-toggle"
            ) as (HTMLElement & { __plasmoIdentity?: string }) | null
          )?.__plasmoIdentity === "toggle"
        )
      })
    })
    .toBe(true)

  await expect
    .poll(async () => {
      return youtubePage
        .locator("#plasmo-summarize-youtube-chapter-toggle")
        .evaluate((element) => {
          const toggle = element as HTMLElement
          const host = document.querySelector(
            "#plasmo-summarize-youtube-chapter-toggle-host"
          ) as HTMLElement | null
          const playButton = document.querySelector(
            ".ytp-play-button"
          ) as HTMLElement | null
          const muteButton = document.querySelector(
            ".ytp-mute-button"
          ) as HTMLElement | null
          const timeDisplay = document.querySelector(
            ".ytp-time-display"
          ) as HTMLElement | null
          const styles = getComputedStyle(toggle)
          const toggleRect = toggle.getBoundingClientRect()
          const getCenterY = (target: HTMLElement | null) => {
            if (!target) {
              return null
            }

            const rect = target.getBoundingClientRect()

            return rect.top + rect.height / 2
          }

          return {
            hostHeight: host ? getComputedStyle(host).height : null,
            hostPaddingTop: host
              ? Number.parseFloat(getComputedStyle(host).paddingTop)
              : null,
            paddingLeft: Number.parseFloat(styles.paddingLeft),
            paddingRight: Number.parseFloat(styles.paddingRight),
            playDelta: Math.abs(
              (getCenterY(playButton) ?? 0) -
                (toggleRect.top + toggleRect.height / 2)
            ),
            muteDelta: Math.abs(
              (getCenterY(muteButton) ?? 0) -
                (toggleRect.top + toggleRect.height / 2)
            ),
            timeDelta: Math.abs(
              (getCenterY(timeDisplay) ?? 0) -
                (toggleRect.top + toggleRect.height / 2)
            )
          }
        })
    })
    .toEqual(
      expect.objectContaining({
        hostHeight: "56px",
        hostPaddingTop: 0,
        paddingLeft: 8,
        paddingRight: 8,
        playDelta: expect.any(Number),
        muteDelta: expect.any(Number),
        timeDelta: expect.any(Number)
      })
    )
  await expect
    .poll(async () => {
      return youtubePage
        .locator("#plasmo-summarize-youtube-chapter-toggle")
        .evaluate((element) => {
          const toggle = element as HTMLElement
          const playButton = document.querySelector(
            ".ytp-play-button"
          ) as HTMLElement | null
          const muteButton = document.querySelector(
            ".ytp-mute-button"
          ) as HTMLElement | null
          const timeDisplay = document.querySelector(
            ".ytp-time-display"
          ) as HTMLElement | null
          const toggleCenter =
            toggle.getBoundingClientRect().top +
            toggle.getBoundingClientRect().height / 2
          const getCenterY = (target: HTMLElement | null) => {
            if (!target) {
              return null
            }

            const rect = target.getBoundingClientRect()

            return rect.top + rect.height / 2
          }

          return {
            playDelta: Math.abs((getCenterY(playButton) ?? 0) - toggleCenter),
            muteDelta: Math.abs((getCenterY(muteButton) ?? 0) - toggleCenter),
            timeDelta: Math.abs((getCenterY(timeDisplay) ?? 0) - toggleCenter)
          }
        })
    })
    .toEqual({
      playDelta: 0,
      muteDelta: 0,
      timeDelta: 0
    })
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

  await youtubePage
    .locator("#plasmo-summarize-youtube-chapter-toggle")
    .evaluate((element) => {
      ;(element as HTMLButtonElement).click()
    })

  await expect(
    youtubePage.locator("#plasmo-summarize-youtube-engagement-panel")
  ).toBeVisible()
  await expect(
    youtubePage.locator(".plasmo-ai-native-chapter-item")
  ).toHaveCount(2)
  await expect(
    youtubePage.locator(".plasmo-ai-native-panel-summary")
  ).toContainText("Mock Gemini overview for fallback chapters.")

  await youtubePage
    .locator(".plasmo-ai-native-chapter-item")
    .first()
    .evaluate((element) => {
      ;(
        element as HTMLElement & { __plasmoIdentity?: string }
      ).__plasmoIdentity = "chapter-0"
    })

  await triggerUnrelatedYoutubeMutation(youtubePage)

  await expect
    .poll(async () => {
      return youtubePage.evaluate(() => {
        return (
          (
            document.querySelector(".plasmo-ai-native-chapter-item") as
              | (HTMLElement & { __plasmoIdentity?: string })
              | null
          )?.__plasmoIdentity === "chapter-0"
        )
      })
    })
    .toBe(true)

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

test("falls back to metadata when only an ad-only secondary rail is available", async ({
  context,
  runtimeErrors
}) => {
  await installMockRoutes(context)

  const youtubePage = await context.newPage()

  await youtubePage.goto("https://www.youtube.com/watch?v=ad-rail-video")

  await setLocalStorageValue<StoredGeminiChapterResults>(
    context,
    GEMINI_VIDEO_CHAPTERS_KEY,
    {
      "ad-rail-video": {
        capturedAt: Date.now(),
        chapters: [
          { start: "0:00", title: "Opening" },
          { end: "2:10", start: "1:15", title: "Deep dive" }
        ],
        requestId: "ad-rail-request",
        summary: "Mock Gemini overview for the ad rail fallback case.",
        videoId: "ad-rail-video",
        videoUrl: "https://www.youtube.com/watch?v=ad-rail-video"
      }
    }
  )

  await expect(
    youtubePage.locator("#plasmo-summarize-youtube-chapter-toggle")
  ).toBeVisible({ timeout: 15_000 })

  await youtubePage.locator("#plasmo-summarize-youtube-chapter-toggle").click()

  await expect(
    youtubePage.locator("#plasmo-summarize-youtube-chapters-host")
  ).toBeVisible()
  await expect(
    youtubePage.locator("#plasmo-summarize-youtube-engagement-panel")
  ).toBeVisible()
  await expect(
    youtubePage.locator("#secondary > #plasmo-summarize-youtube-chapters-host")
  ).toHaveCount(0)
  await expect(
    youtubePage.locator("#related > #plasmo-summarize-youtube-chapters-host")
  ).toHaveCount(0)

  assertNoRuntimeErrors(runtimeErrors)
})

test("restores the native timeline during SPA navigation after generated chapters were shown", async ({
  context,
  runtimeErrors
}) => {
  await installMockRoutes(context)

  const youtubePage = await context.newPage()

  await youtubePage.goto("https://www.youtube.com/watch?v=fallback-video")

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
        requestId: "fallback-request",
        summary: "Mock Gemini overview for fallback chapters.",
        videoId: "fallback-video",
        videoUrl: "https://www.youtube.com/watch?v=fallback-video"
      }
    }
  )

  await expect(
    youtubePage.locator(
      ".ytp-chapters-container #plasmo-summarize-youtube-chapter-timeline"
    )
  ).toBeVisible({ timeout: 15_000 })
  await expect(
    youtubePage.locator(
      ".ytp-chapters-container > .ytp-chapter-hover-container:not(#plasmo-summarize-youtube-chapter-timeline)"
    )
  ).toBeHidden()

  await youtubePage.evaluate(() => {
    history.pushState({}, "", "/watch?v=next-video")

    const hiddenNativeSegment = document.querySelector<HTMLElement>(
      '.ytp-chapter-hover-container[data-plasmo-generated-base-hidden="true"]'
    )

    if (!hiddenNativeSegment || !hiddenNativeSegment.parentElement) {
      return
    }

    const wrapper = document.createElement("div")

    wrapper.className = "ytp-progress-reuse-wrapper"
    hiddenNativeSegment.parentElement.append(wrapper)
    wrapper.append(hiddenNativeSegment)
  })

  await expect(
    youtubePage.locator("#plasmo-summarize-youtube-chapter-timeline")
  ).toHaveCount(0)
  await expect
    .poll(async () => {
      return youtubePage.evaluate(() => {
        const nativeSegment = document.querySelector<HTMLElement>(
          ".ytp-progress-reuse-wrapper .ytp-chapter-hover-container"
        )

        if (!nativeSegment) {
          return null
        }

        return {
          computedDisplay: getComputedStyle(nativeSegment).display,
          hiddenAttr: nativeSegment.getAttribute(
            "data-plasmo-generated-base-hidden"
          ),
          inlineDisplay: nativeSegment.style.display
        }
      })
    })
    .toEqual({
      computedDisplay: "block",
      hiddenAttr: null,
      inlineDisplay: ""
    })

  assertNoRuntimeErrors(runtimeErrors)
})
