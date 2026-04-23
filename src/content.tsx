import type { PlasmoCSConfig } from "plasmo"

import {
  ACTIVE_GEMINI_SUMMARY_KEY,
  buildGeminiPrompt,
  extractYoutubeVideoId,
  GEMINI_VIDEO_CHAPTERS_KEY,
  PENDING_GEMINI_SUMMARY_KEY,
  type GeminiChapter,
  type PendingGeminiSummaryRequest,
  type StoredGeminiChapterResults
} from "~gemini-workflow"

export const config: PlasmoCSConfig = {
  matches: ["https://www.youtube.com/*", "https://gemini.google.com/*"]
}

const GEMINI_REQUEST_TTL_MS = 15 * 60 * 1000
const SUMMARY_BUTTON_HOST_ID = "plasmo-summarize-youtube-host"
const SUMMARY_BUTTON_ID = "plasmo-summarize-youtube-button"
const CHAPTER_PANEL_HOST_ID = "plasmo-summarize-youtube-chapters-host"
const CHAPTER_PANEL_ID = "plasmo-summarize-youtube-engagement-panel"
const CHAPTER_TOGGLE_HOST_ID = "plasmo-summarize-youtube-chapter-toggle-host"
const CHAPTER_TOGGLE_ID = "plasmo-summarize-youtube-chapter-toggle"
const CHAPTER_TIMELINE_ID = "plasmo-summarize-youtube-chapter-timeline"
const GENERATED_TIMELINE_HIDDEN_ATTR = "data-plasmo-generated-base-hidden"
const SUMMARY_BUTTON_STYLE_ID = "plasmo-summarize-youtube-style"
const URL_CHANGE_EVENT = "plasmo:urlchange"

let buttonResetTimeout: number | null = null
let geminiCaptureScheduled = false
let geminiCaptureInFlight = false
let geminiAttemptScheduled = false
let geminiAttemptInFlight = false
let historyListenersInstalled = false
let mutationObserverInstalled = false
let lastHandledGeminiRequest = 0
let youtubeRefreshScheduled = false
let generatedChapterPanelOpen = false
let generatedChapterMountSequence = 0
let generatedChapterSync: {
  callback: () => void
  video: HTMLVideoElement
} | null = null
let generatedChapterHoverSync: {
  clearHover: () => void
  handleDocumentMove: (event: MouseEvent) => void
  handleMove: (event: MouseEvent) => void
  progressBar: HTMLElement
} | null = null
let generatedChapterTooltipSync: MutationObserver | null = null

const isYoutubeWatchPage = () =>
  window.location.hostname === "www.youtube.com" &&
  window.location.pathname === "/watch"

const isGeminiPage = () => window.location.hostname === "gemini.google.com"

const createGeminiRequestId = () => crypto.randomUUID()

const getCurrentYoutubeVideoId = () =>
  extractYoutubeVideoId(window.location.href)

const injectButtonStyles = () => {
  if (document.getElementById(SUMMARY_BUTTON_STYLE_ID)) {
    return
  }

  const style = document.createElement("style")

  style.id = SUMMARY_BUTTON_STYLE_ID
  style.textContent = `
    #${SUMMARY_BUTTON_HOST_ID} {
      display: inline-flex;
      align-items: center;
      margin-right: 8px;
      flex: 0 0 auto;
    }

    #${SUMMARY_BUTTON_ID} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 36px;
      padding: 0 16px;
      border-radius: 9999px;
      border: 1px solid rgba(15, 23, 42, 0.12);
      background: linear-gradient(135deg, rgba(12, 74, 110, 0.08), rgba(14, 116, 144, 0.14));
      color: rgb(15, 23, 42);
      font: 600 14px/1.1 "IBM Plex Sans", "Segoe UI", sans-serif;
      letter-spacing: 0.01em;
      cursor: pointer;
      transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, opacity 160ms ease;
      box-shadow: 0 10px 24px rgba(14, 116, 144, 0.1);
    }

    html[dark] #${SUMMARY_BUTTON_ID} {
      border-color: rgba(255, 255, 255, 0.12);
      background: linear-gradient(135deg, rgba(34, 211, 238, 0.18), rgba(14, 165, 233, 0.12));
      color: rgb(226, 232, 240);
      box-shadow: 0 12px 28px rgba(8, 47, 73, 0.26);
    }

    #${SUMMARY_BUTTON_ID}:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 14px 28px rgba(14, 116, 144, 0.18);
    }

    #${SUMMARY_BUTTON_ID}:disabled {
      opacity: 0.68;
      cursor: wait;
    }

    #${SUMMARY_BUTTON_ID}[data-state="success"] {
      border-color: rgba(22, 163, 74, 0.34);
    }

    #${SUMMARY_BUTTON_ID}[data-state="error"] {
      border-color: rgba(220, 38, 38, 0.32);
    }

    #${CHAPTER_TOGGLE_HOST_ID} {
      display: inline-flex;
      align-items: center;
      flex: 0 1 auto;
      min-width: 0;
      height: 56px;
      max-width: min(460px, 40vw);
      margin-left: 12px;
      padding: 0;
      box-sizing: border-box;
      color: white;
      align-self: center;
    }

    .ytp-left-controls #${CHAPTER_TOGGLE_HOST_ID} {
      align-self: center;
    }

    #${CHAPTER_TOGGLE_ID} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
      max-width: 100%;
      min-height: 24px;
      padding: 0 8px;
      box-sizing: border-box;
      border-radius: 12px;
      color: white;
      line-height: 1.2;
      opacity: 0.94;
    }

    #${CHAPTER_TOGGLE_ID} .ytp-chapter-title-prefix {
      flex: 0 0 auto;
      margin-right: 6px;
      color: rgba(255, 255, 255, 0.7);
      font-size: 14px;
      line-height: 1;
    }

    #${CHAPTER_TOGGLE_ID} .ytp-chapter-title-content {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    #${CHAPTER_TOGGLE_ID}[aria-expanded="true"] {
      opacity: 1;
    }

    #${CHAPTER_TIMELINE_ID} {
      position: absolute;
      inset: 0;
      display: flex;
      gap: 4px;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    }

    #${CHAPTER_TIMELINE_ID} .plasmo-ai-chapter-segment {
      flex: var(--chapter-flex, 1) 1 0%;
      min-width: 0;
      height: 100%;
      position: relative;
      overflow: hidden;
    }

    #${CHAPTER_TIMELINE_ID} .plasmo-ai-chapter-segment .ytp-progress-bar-padding {
      display: none;
    }

    #${CHAPTER_TIMELINE_ID} .plasmo-ai-chapter-segment .ytp-progress-list {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      overflow: hidden;
    }

    #${CHAPTER_TIMELINE_ID} .plasmo-ai-chapter-segment .ytp-play-progress,
    #${CHAPTER_TIMELINE_ID} .plasmo-ai-chapter-segment .ytp-load-progress,
    #${CHAPTER_TIMELINE_ID} .plasmo-ai-chapter-segment .ytp-hover-progress {
      left: 0;
      transform-origin: left center;
    }

    #${CHAPTER_TIMELINE_ID} .plasmo-ai-chapter-segment .ytp-hover-progress,
    #${CHAPTER_TIMELINE_ID} .plasmo-ai-chapter-segment .ytp-ad-progress-list {
      display: none;
    }

    #${CHAPTER_PANEL_HOST_ID} {
      display: block;
      width: 100%;
      margin-top: 12px;
    }

    #${CHAPTER_PANEL_HOST_ID}[hidden] {
      display: none;
    }

    #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-panel-shell {
      display: block;
      border: 1px solid rgba(0, 0, 0, 0.08);
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
      overflow: hidden;
    }

    html[dark] #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-panel-shell {
      border-color: rgba(255, 255, 255, 0.08);
      background: #0f0f0f;
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
    }

    #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-panel-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 16px 8px;
    }

    #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-panel-eyebrow {
      display: inline-flex;
      margin-bottom: 6px;
      font: 700 11px/1 "IBM Plex Sans", "Segoe UI", sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #065fd4;
    }

    #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-panel-title {
      margin: 0;
      font: 600 20px/1.2 "Roboto", "Arial", sans-serif;
      color: #0f0f0f;
    }

    html[dark] #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-panel-title {
      color: #f1f1f1;
    }

    #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-panel-close {
      border: 0;
      background: transparent;
      color: #606060;
      cursor: pointer;
      font: 500 13px/1 "Roboto", "Arial", sans-serif;
      padding: 6px 0;
    }

    html[dark] #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-panel-close {
      color: #aaa;
    }

    #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-panel-summary {
      margin: 0;
      padding: 0 16px 12px;
      color: #606060;
      font: 400 14px/1.5 "Roboto", "Arial", sans-serif;
    }

    html[dark] #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-panel-summary {
      color: #aaa;
    }

    #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-panel-list {
      display: grid;
      padding: 0 8px 8px;
      gap: 2px;
    }

    #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-chapter-item {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 12px 8px;
      border: 0;
      border-radius: 12px;
      background: transparent;
      color: inherit;
      text-align: left;
      cursor: pointer;
      transition: background-color 160ms ease;
    }

    #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-chapter-item:hover,
    #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-chapter-item[data-active="true"] {
      background: rgba(0, 0, 0, 0.05);
    }

    html[dark] #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-chapter-item:hover,
    html[dark] #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-chapter-item[data-active="true"] {
      background: rgba(255, 255, 255, 0.08);
    }

    #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-chapter-time {
      color: #606060;
      font: 500 13px/1.2 "Roboto", "Arial", sans-serif;
    }

    html[dark] #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-chapter-time {
      color: #aaa;
    }

    #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-chapter-copy {
      display: grid;
      gap: 4px;
      min-width: 0;
    }

    #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-chapter-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #0f0f0f;
      font: 500 14px/1.35 "Roboto", "Arial", sans-serif;
    }

    html[dark] #${CHAPTER_PANEL_HOST_ID} .plasmo-ai-native-chapter-title {
      color: #f1f1f1;
    }
  `

  document.head.append(style)
}

const isVisible = (element: Element | null): element is HTMLElement => {
  if (!(element instanceof HTMLElement)) {
    return false
  }

  const rect = element.getBoundingClientRect()

  return rect.width > 0 && rect.height > 0
}

const isExtensionManagedNode = (node: Node | null) => {
  if (!node) {
    return false
  }

  const element = node instanceof Element ? node : node.parentElement

  if (!element) {
    return false
  }

  if (
    element.id === SUMMARY_BUTTON_HOST_ID ||
    element.id === CHAPTER_PANEL_HOST_ID ||
    element.id === CHAPTER_TOGGLE_HOST_ID ||
    element.id === CHAPTER_TIMELINE_ID ||
    element.id === SUMMARY_BUTTON_STYLE_ID
  ) {
    return true
  }

  return Boolean(
    element.closest(
      `#${SUMMARY_BUTTON_HOST_ID}, #${CHAPTER_PANEL_HOST_ID}, #${CHAPTER_TOGGLE_HOST_ID}, #${CHAPTER_TIMELINE_ID}, #${SUMMARY_BUTTON_STYLE_ID}`
    )
  )
}

const shouldIgnoreMutation = (mutation: MutationRecord) => {
  if (isExtensionManagedNode(mutation.target)) {
    return true
  }

  const changedNodes = [
    ...Array.from(mutation.addedNodes),
    ...Array.from(mutation.removedNodes)
  ]

  return changedNodes.length > 0 && changedNodes.every(isExtensionManagedNode)
}

const findYoutubeActionRow = () => {
  const selectors = [
    "ytd-watch-metadata #top-level-buttons-computed",
    "#above-the-fold #top-level-buttons-computed",
    "#actions-inner #top-level-buttons-computed"
  ]

  for (const selector of selectors) {
    const match = document.querySelector(selector)

    if (isVisible(match)) {
      return match
    }
  }

  return null
}

const updateSummaryButton = (
  label: string,
  state: "busy" | "error" | "idle" | "success",
  disabled: boolean
) => {
  const button = document.getElementById(
    SUMMARY_BUTTON_ID
  ) as HTMLButtonElement | null

  if (!button) {
    return
  }

  button.textContent = label
  button.dataset.state = state
  button.disabled = disabled
  button.setAttribute("aria-busy", String(state === "busy"))
}

const scheduleButtonReset = () => {
  if (buttonResetTimeout !== null) {
    window.clearTimeout(buttonResetTimeout)
  }

  buttonResetTimeout = window.setTimeout(() => {
    updateSummaryButton("Generate chapters", "idle", false)
  }, 2200)
}

const copyTextToClipboard = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value)

    return
  } catch {
    const helper = document.createElement("textarea")

    helper.value = value
    helper.setAttribute("readonly", "true")
    helper.style.position = "fixed"
    helper.style.opacity = "0"
    document.body.append(helper)
    helper.select()
    document.execCommand("copy")
    helper.remove()
  }
}

const sendMessage = <TResponse,>(message: unknown) =>
  new Promise<TResponse>((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: TResponse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))

        return
      }

      resolve(response)
    })
  })

const getLocalStorageValue = <TValue,>(key: string) =>
  new Promise<TValue | undefined>((resolve, reject) => {
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))

        return
      }

      resolve(result[key] as TValue | undefined)
    })
  })

const removeLocalStorageValue = (key: string) =>
  new Promise<void>((resolve, reject) => {
    chrome.storage.local.remove(key, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))

        return
      }

      resolve()
    })
  })

const setLocalStorageValue = <TValue,>(key: string, value: TValue) =>
  new Promise<void>((resolve, reject) => {
    chrome.storage.local.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))

        return
      }

      resolve()
    })
  })

const parseTimestampToSeconds = (value: string) => {
  const parts = value
    .trim()
    .split(":")
    .map((part) => Number(part))

  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((part) => Number.isNaN(part) || part < 0)
  ) {
    return null
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts

    if (seconds >= 60) {
      return null
    }

    return minutes * 60 + seconds
  }

  const [hours, minutes, seconds] = parts

  if (minutes >= 60 || seconds >= 60) {
    return null
  }

  return hours * 3600 + minutes * 60 + seconds
}

const formatTimestamp = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

const normalizeTimestamp = (value: string) => {
  const totalSeconds = parseTimestampToSeconds(value)

  if (totalSeconds === null) {
    return null
  }

  return formatTimestamp(totalSeconds)
}

const normalizeGeminiChapters = (value: unknown): GeminiChapter[] => {
  if (!Array.isArray(value)) {
    return []
  }

  const chaptersByStart = new Map<number, GeminiChapter>()

  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue
    }

    const rawChapter = entry as {
      end?: unknown
      start?: unknown
      title?: unknown
    }
    const title =
      typeof rawChapter.title === "string" ? rawChapter.title.trim() : ""
    const start =
      typeof rawChapter.start === "string"
        ? normalizeTimestamp(rawChapter.start)
        : null

    if (!title || !start) {
      continue
    }

    const startSeconds = parseTimestampToSeconds(start)

    if (startSeconds === null) {
      continue
    }

    const normalizedChapter: GeminiChapter = { start, title }

    if (typeof rawChapter.end === "string") {
      const end = normalizeTimestamp(rawChapter.end)
      const endSeconds = end ? parseTimestampToSeconds(end) : null

      if (end && endSeconds !== null && endSeconds > startSeconds) {
        normalizedChapter.end = end
      }
    }

    chaptersByStart.set(startSeconds, normalizedChapter)
  }

  return Array.from(chaptersByStart.entries())
    .sort(([leftSeconds], [rightSeconds]) => leftSeconds - rightSeconds)
    .map(([, chapter]) => chapter)
}

const extractJsonCandidates = (text: string) => {
  const matches: string[] = []
  const trimmedText = text.trim()

  if (trimmedText.startsWith("{") && trimmedText.endsWith("}")) {
    matches.push(trimmedText)
  }

  for (const match of text.matchAll(/```json\s*([\s\S]*?)```/gi)) {
    const candidate = match[1]?.trim()

    if (candidate) {
      matches.push(candidate)
    }
  }

  return matches
}

const parseChapterPayloadFromText = (text: string, requestId: string) => {
  for (const candidate of extractJsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate) as {
        chapters?: unknown
        requestId?: unknown
      }

      if (parsed.requestId !== requestId) {
        continue
      }

      return {
        chapters: normalizeGeminiChapters(parsed.chapters)
      }
    } catch {
      continue
    }
  }

  return null
}

const extractOverviewFromText = (text: string) => {
  const match = text
    .replace(/\r\n/g, "\n")
    .match(/OVERVIEW:\s*([\s\S]*?)\n\s*CHAPTERS_JSON:/i)

  return match?.[1]?.trim() ?? ""
}

const extractGeminiChapterResult = (requestId: string) => {
  for (const element of Array.from(document.querySelectorAll("pre, code"))) {
    const candidateText = element.textContent?.trim()

    if (!candidateText) {
      continue
    }

    const payload = parseChapterPayloadFromText(candidateText, requestId)

    if (!payload) {
      continue
    }

    const responseContainer = element.closest(
      "message-content, [data-message-author-role='model'], [data-response-id], .conversation-turn, .model-response-text"
    ) as HTMLElement | null

    return {
      chapters: payload.chapters,
      summary: extractOverviewFromText(responseContainer?.innerText ?? "")
    }
  }

  const bodyText = document.body?.innerText ?? ""
  const payload = parseChapterPayloadFromText(bodyText, requestId)

  if (!payload) {
    return null
  }

  return {
    chapters: payload.chapters,
    summary: extractOverviewFromText(bodyText)
  }
}

const hasDescriptionTimestampLinks = () => {
  const description = document.querySelector(
    "#description, ytd-watch-metadata #description-inline-expander, ytd-text-inline-expander#description-inline-expander"
  )

  if (!description) {
    return false
  }

  const timestampLinks = Array.from(description.querySelectorAll("a")).filter(
    (link) => parseTimestampToSeconds(link.textContent?.trim() ?? "") !== null
  )

  return timestampLinks.length >= 3
}

const hasNativeYoutubeChapters = () => {
  const nativeSelectors = [
    "ytd-macro-markers-list-renderer",
    "ytd-macro-markers-list-item-renderer",
    'ytd-engagement-panel-section-list-renderer[target-id*="chapter"]',
    'ytd-engagement-panel-section-list-renderer[target-id*="macro-markers"]'
  ]

  return (
    nativeSelectors.some((selector) => {
      const match = document.querySelector(selector)

      return Boolean(match && !isExtensionManagedNode(match))
    }) || hasDescriptionTimestampLinks()
  )
}

type ResolvedGeminiChapter = GeminiChapter & {
  endSeconds: number
  startSeconds: number
}

const getVideoElement = () =>
  document.querySelector("video") as HTMLVideoElement | null

const getVideoDurationSeconds = () => {
  const video = getVideoElement()
  const durationText = document
    .querySelector<HTMLElement>(".ytp-time-duration")
    ?.textContent?.trim()
  const sliderMaxValue = Number(
    document
      .querySelector<HTMLElement>(".ytp-progress-bar")
      ?.getAttribute("aria-valuemax") ?? ""
  )

  if (video && Number.isFinite(video.duration) && video.duration > 0) {
    return Math.floor(video.duration)
  }

  const parsedDuration = durationText
    ? parseTimestampToSeconds(durationText)
    : null

  if (parsedDuration !== null) {
    return parsedDuration
  }

  if (Number.isFinite(sliderMaxValue) && sliderMaxValue > 0) {
    return Math.floor(sliderMaxValue)
  }

  return null
}

const resolveGeminiChapters = (
  chapters: GeminiChapter[],
  durationSeconds: number | null
) => {
  const baseChapters = chapters
    .map((chapter) => {
      const startSeconds = parseTimestampToSeconds(chapter.start)
      const explicitEndSeconds = chapter.end
        ? parseTimestampToSeconds(chapter.end)
        : null

      if (startSeconds === null) {
        return null
      }

      return {
        ...chapter,
        explicitEndSeconds,
        startSeconds
      }
    })
    .filter(
      (
        chapter
      ): chapter is GeminiChapter & {
        explicitEndSeconds: number | null
        startSeconds: number
      } => chapter !== null
    )

  if (baseChapters.length === 0) {
    return []
  }

  const derivedDuration = Math.max(
    durationSeconds ?? 0,
    ...baseChapters.map(
      (chapter) => chapter.explicitEndSeconds ?? chapter.startSeconds
    )
  )

  return baseChapters.map((chapter, index) => {
    const nextChapter = baseChapters[index + 1]
    const fallbackEnd = nextChapter
      ? nextChapter.startSeconds
      : Math.max(derivedDuration, chapter.startSeconds + 1)
    const endSeconds = Math.max(
      chapter.startSeconds + 1,
      chapter.explicitEndSeconds ?? fallbackEnd
    )

    return {
      endSeconds,
      startSeconds: chapter.startSeconds,
      ...(chapter.end ? { end: chapter.end } : {}),
      start: chapter.start,
      title: chapter.title
    }
  })
}

const getCurrentResolvedChapter = (
  chapters: ResolvedGeminiChapter[],
  currentTime: number
) => {
  return (
    chapters.find((chapter, index) => {
      const isLastChapter = index === chapters.length - 1

      if (isLastChapter) {
        return currentTime >= chapter.startSeconds
      }

      return (
        currentTime >= chapter.startSeconds && currentTime < chapter.endSeconds
      )
    }) ?? chapters[0]
  )
}

const findChapterPanelMountTarget = () => {
  const selectors = [
    "#secondary-inner",
    "#meta-contents",
    "ytd-watch-metadata",
    "#above-the-fold",
    "#secondary",
    "#related"
  ]

  for (const selector of selectors) {
    const match = document.querySelector(selector)

    if (match instanceof HTMLElement) {
      return match as HTMLElement
    }
  }

  return null
}

const findChapterToggleMountTarget = () => {
  const selectors = [".ytp-time-display", ".ytp-left-controls"]

  for (const selector of selectors) {
    const match = document.querySelector(selector)

    if (match instanceof HTMLElement) {
      return match
    }
  }

  return null
}

const findChapterTimelineMountTarget = () => {
  const selectors = [".ytp-chapters-container", ".ytp-progress-bar"]

  for (const selector of selectors) {
    const match = document.querySelector(selector)

    if (match instanceof HTMLElement) {
      return match
    }
  }

  return null
}

const restoreGeneratedTimelineBaseSegments = (root: ParentNode = document) => {
  for (const baseSegment of Array.from(
    root.querySelectorAll<HTMLElement>(
      `[${GENERATED_TIMELINE_HIDDEN_ATTR}="true"]`
    )
  )) {
    const previousDisplay = baseSegment.dataset.plasmoOriginalDisplay ?? ""

    if (previousDisplay) {
      baseSegment.style.display = previousDisplay
    } else {
      baseSegment.style.removeProperty("display")
    }

    delete baseSegment.dataset.plasmoOriginalDisplay
    baseSegment.removeAttribute(GENERATED_TIMELINE_HIDDEN_ATTR)
  }
}

const removeGeneratedChapterUi = () => {
  document.getElementById(CHAPTER_PANEL_HOST_ID)?.remove()
  document.getElementById(CHAPTER_TOGGLE_HOST_ID)?.remove()
  document.getElementById(CHAPTER_TIMELINE_ID)?.remove()

  restoreGeneratedTimelineBaseSegments()

  for (const generatedTimelineHost of Array.from(
    document.querySelectorAll<HTMLElement>(
      `.ytp-chapters-container[data-plasmo-generated="true"]`
    )
  )) {
    if (!generatedTimelineHost.querySelector(`#${CHAPTER_TIMELINE_ID}`)) {
      generatedTimelineHost.remove()
    }
  }
}

const unbindGeneratedChapterSync = () => {
  if (!generatedChapterSync) {
    return
  }

  const { callback, video } = generatedChapterSync

  video.removeEventListener("timeupdate", callback)
  video.removeEventListener("seeking", callback)
  video.removeEventListener("loadedmetadata", callback)
  video.removeEventListener("durationchange", callback)

  generatedChapterSync = null
}

const unbindGeneratedChapterHoverSync = () => {
  if (!generatedChapterHoverSync) {
    return
  }

  const { clearHover, handleDocumentMove, handleMove, progressBar } =
    generatedChapterHoverSync

  document.removeEventListener("mousemove", handleDocumentMove, true)
  progressBar.removeEventListener("mouseenter", handleMove)
  progressBar.removeEventListener("mousemove", handleMove)
  progressBar.removeEventListener("mouseleave", clearHover)

  clearHover()
  generatedChapterHoverSync = null
}

const unbindGeneratedChapterTooltipSync = () => {
  generatedChapterTooltipSync?.disconnect()
  generatedChapterTooltipSync = null
}

const seekVideoToTimestamp = (timestamp: string) => {
  const targetSeconds = parseTimestampToSeconds(timestamp)
  const video = getVideoElement()

  if (targetSeconds === null || !video) {
    return
  }

  video.currentTime = targetSeconds
  void video.play().catch(() => undefined)
}

const setGeneratedChapterPanelVisibility = (isOpen: boolean) => {
  generatedChapterPanelOpen = isOpen

  const host = document.getElementById(CHAPTER_PANEL_HOST_ID)
  const toggle = document.getElementById(CHAPTER_TOGGLE_ID)

  if (host instanceof HTMLElement) {
    host.hidden = !isOpen
  }

  if (toggle instanceof HTMLButtonElement) {
    toggle.setAttribute("aria-expanded", String(isOpen))
  }
}

const setGeneratedTimelineTooltipTitle = (title: string) => {
  const tooltipPillTitle = document.querySelector<HTMLElement>(
    ".ytp-tooltip-progress-bar-pill-title"
  )
  const tooltipTitle = document.querySelector<HTMLElement>(
    ".ytp-tooltip-title span"
  )

  if (tooltipPillTitle) {
    tooltipPillTitle.textContent = title
  }

  if (tooltipTitle) {
    tooltipTitle.textContent = title
  }
}

const setGeneratedTimelineHoverPreview = (hoveredSeconds: number | null) => {
  let hoveredChapterTitle = ""

  for (const segment of Array.from(
    document.querySelectorAll<HTMLElement>(".plasmo-ai-chapter-segment")
  )) {
    const hoverProgress = segment.querySelector<HTMLElement>(
      ".ytp-hover-progress"
    )
    const startSeconds = Number(segment.dataset.startSeconds ?? "0")
    const endSeconds = Number(segment.dataset.endSeconds ?? startSeconds)
    const durationSeconds = Math.max(1, endSeconds - startSeconds)
    const isHovered =
      hoveredSeconds !== null &&
      hoveredSeconds >= startSeconds &&
      hoveredSeconds < endSeconds

    if (hoverProgress) {
      hoverProgress.style.display = isHovered ? "block" : "none"
      hoverProgress.style.transform = isHovered
        ? `scaleX(${Math.min(
            1,
            Math.max(0, (hoveredSeconds - startSeconds) / durationSeconds)
          )})`
        : "scaleX(0)"
    }

    if (isHovered) {
      hoveredChapterTitle = segment.dataset.chapterTitle ?? ""
    }
  }

  setGeneratedTimelineTooltipTitle(hoveredChapterTitle)
}

const syncGeneratedTimelineTooltipFromTimestamp = (
  chapters: ResolvedGeminiChapter[]
) => {
  const tooltipTimestamp = document
    .querySelector<HTMLElement>(".ytp-tooltip-progress-bar-pill-time-stamp")
    ?.textContent?.trim()

  if (!tooltipTimestamp) {
    setGeneratedTimelineHoverPreview(null)

    return
  }

  const hoveredSeconds = parseTimestampToSeconds(tooltipTimestamp)

  if (hoveredSeconds === null) {
    setGeneratedTimelineTooltipTitle("")

    return
  }

  const durationSeconds = getVideoDurationSeconds()

  if (durationSeconds !== null) {
    setGeneratedTimelineHoverPreview(Math.min(hoveredSeconds, durationSeconds))

    return
  }

  setGeneratedTimelineTooltipTitle(
    getCurrentResolvedChapter(chapters, hoveredSeconds).title
  )
}

const updateGeneratedChapterUiState = (chapters: ResolvedGeminiChapter[]) => {
  const video = getVideoElement()
  const toggle = document.getElementById(CHAPTER_TOGGLE_ID)
  const activeChapter = getCurrentResolvedChapter(
    chapters,
    video?.currentTime ?? 0
  )
  const currentTime = video?.currentTime ?? 0
  const bufferedEnd =
    video && video.buffered.length > 0
      ? video.buffered.end(video.buffered.length - 1)
      : currentTime

  if (toggle instanceof HTMLButtonElement && activeChapter) {
    const content = toggle.querySelector<HTMLElement>(
      ".ytp-chapter-title-content"
    )

    if (content) {
      content.textContent = activeChapter.title
    } else {
      toggle.textContent = activeChapter.title
    }

    toggle.title = activeChapter.title
  }

  for (const item of Array.from(
    document.querySelectorAll<HTMLElement>(".plasmo-ai-native-chapter-item")
  )) {
    item.dataset.active = String(
      item.dataset.startSeconds === String(activeChapter?.startSeconds)
    )
  }

  for (const segment of Array.from(
    document.querySelectorAll<HTMLElement>(".plasmo-ai-chapter-segment")
  )) {
    const startSeconds = Number(segment.dataset.startSeconds ?? "0")
    const endSeconds = Number(segment.dataset.endSeconds ?? startSeconds)
    const durationSeconds = Math.max(1, endSeconds - startSeconds)
    const playedRatio = Math.min(
      1,
      Math.max(0, (currentTime - startSeconds) / durationSeconds)
    )
    const bufferedRatio = Math.min(
      1,
      Math.max(0, (bufferedEnd - startSeconds) / durationSeconds)
    )
    const playProgress =
      segment.querySelector<HTMLElement>(".ytp-play-progress")
    const loadProgress =
      segment.querySelector<HTMLElement>(".ytp-load-progress")

    segment.dataset.active = String(
      segment.dataset.startSeconds === String(activeChapter?.startSeconds)
    )

    if (playProgress) {
      playProgress.style.transform = `scaleX(${playedRatio})`
      playProgress.style.backgroundSize = "100% 100%"
      playProgress.style.backgroundPositionX = "0px"
    }

    if (loadProgress) {
      loadProgress.style.transform = `scaleX(${bufferedRatio})`
    }
  }
}

const bindGeneratedChapterSync = (chapters: ResolvedGeminiChapter[]) => {
  const video = getVideoElement()

  if (!video) {
    unbindGeneratedChapterSync()

    return
  }

  unbindGeneratedChapterSync()

  const callback = () => {
    updateGeneratedChapterUiState(chapters)
  }

  video.addEventListener("timeupdate", callback)
  video.addEventListener("seeking", callback)
  video.addEventListener("loadedmetadata", callback)
  video.addEventListener("durationchange", callback)

  generatedChapterSync = {
    callback,
    video
  }

  callback()
}

const bindGeneratedChapterHoverSync = (chapters: ResolvedGeminiChapter[]) => {
  const progressBar = document.querySelector<HTMLElement>(".ytp-progress-bar")

  if (!progressBar) {
    unbindGeneratedChapterHoverSync()

    return
  }

  unbindGeneratedChapterHoverSync()

  const clearHover = () => {
    setGeneratedTimelineHoverPreview(null)
  }

  const updateFromClientPosition = (clientX: number) => {
    const durationSeconds = getVideoDurationSeconds()
    const rect = progressBar.getBoundingClientRect()

    if (!durationSeconds || rect.width <= 0) {
      clearHover()

      return
    }

    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))

    setGeneratedTimelineHoverPreview(ratio * durationSeconds)
  }

  const handleMove = (event: MouseEvent) => {
    updateFromClientPosition(event.clientX)
  }

  const handleDocumentMove = (event: MouseEvent) => {
    const rect = progressBar.getBoundingClientRect()
    const isInsideProgressBar =
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom

    if (!isInsideProgressBar) {
      return
    }

    updateFromClientPosition(event.clientX)
  }

  document.addEventListener("mousemove", handleDocumentMove, true)
  progressBar.addEventListener("mouseenter", handleMove)
  progressBar.addEventListener("mousemove", handleMove)
  progressBar.addEventListener("mouseleave", clearHover)
  progressBar.dataset.plasmoHoverSync = "true"

  generatedChapterHoverSync = {
    clearHover,
    handleDocumentMove,
    handleMove,
    progressBar
  }
}

const bindGeneratedChapterTooltipSync = (chapters: ResolvedGeminiChapter[]) => {
  const tooltipTimestamp = document.querySelector<HTMLElement>(
    ".ytp-tooltip-progress-bar-pill-time-stamp"
  )

  if (!tooltipTimestamp) {
    unbindGeneratedChapterTooltipSync()

    return
  }

  unbindGeneratedChapterTooltipSync()

  const observer = new MutationObserver(() => {
    syncGeneratedTimelineTooltipFromTimestamp(chapters)
  })

  observer.observe(tooltipTimestamp, {
    characterData: true,
    childList: true,
    subtree: true
  })

  generatedChapterTooltipSync = observer
  syncGeneratedTimelineTooltipFromTimestamp(chapters)
}

const createChapterButton = (chapter: ResolvedGeminiChapter) => {
  const button = document.createElement("button")
  const time = document.createElement("span")
  const label = document.createElement("span")

  button.type = "button"
  button.className = "plasmo-ai-native-chapter-item"
  time.className = "plasmo-ai-native-chapter-time"
  label.className = "plasmo-ai-native-chapter-title"
  button.dataset.startSeconds = String(chapter.startSeconds)

  time.textContent = chapter.end
    ? `${chapter.start} - ${chapter.end}`
    : chapter.start

  const copy = document.createElement("span")

  copy.className = "plasmo-ai-native-chapter-copy"
  label.textContent = chapter.title

  button.addEventListener("click", () => {
    seekVideoToTimestamp(chapter.start)
  })

  copy.append(label)
  button.append(time, copy)

  return button
}

const createGeneratedChapterPanel = (
  chapters: ResolvedGeminiChapter[],
  summary: string
) => {
  const panel = document.createElement("div")
  const header = document.createElement("div")
  const headerText = document.createElement("div")
  const eyebrow = document.createElement("span")
  const title = document.createElement("h2")
  const closeButton = document.createElement("button")
  const list = document.createElement("div")

  panel.id = CHAPTER_PANEL_ID
  panel.className = "plasmo-ai-native-panel-shell"
  panel.setAttribute("role", "dialog")
  panel.setAttribute("aria-label", "Generated chapters")
  header.className = "plasmo-ai-native-panel-header"
  eyebrow.className = "plasmo-ai-native-panel-eyebrow"
  title.className = "plasmo-ai-native-panel-title"
  closeButton.className = "plasmo-ai-native-panel-close"
  list.className = "plasmo-ai-native-panel-list"

  panel.dataset.plasmoGenerated = "true"
  eyebrow.textContent = "Gemini generated"
  title.textContent = "Chapters"
  closeButton.type = "button"
  closeButton.textContent = "Close"
  closeButton.addEventListener("click", () => {
    setGeneratedChapterPanelVisibility(false)
  })

  headerText.append(eyebrow, title)
  header.append(headerText, closeButton)
  panel.append(header)

  if (summary) {
    const summaryElement = document.createElement("p")

    summaryElement.className = "plasmo-ai-native-panel-summary"
    summaryElement.textContent = summary
    panel.append(summaryElement)
  }

  for (const chapter of chapters) {
    list.append(createChapterButton(chapter))
  }

  panel.append(list)

  return panel
}

const syncGeneratedChapterToggleHost = (
  existingHost: HTMLElement | null,
  chapters: ResolvedGeminiChapter[]
) => {
  if (!existingHost) {
    return createGeneratedChapterToggle(chapters)
  }

  const button = existingHost.querySelector<HTMLButtonElement>(
    `#${CHAPTER_TOGGLE_ID}`
  )
  const prefix = existingHost.querySelector<HTMLElement>(
    ".ytp-chapter-title-prefix"
  )
  const content = existingHost.querySelector<HTMLElement>(
    ".ytp-chapter-title-content"
  )

  if (!button || !prefix || !content) {
    return createGeneratedChapterToggle(chapters)
  }

  button.setAttribute("aria-expanded", String(generatedChapterPanelOpen))
  prefix.textContent = "\u2022"
  content.textContent = chapters[0]?.title ?? "Chapters"

  return existingHost
}

const syncGeneratedChapterPanelHost = (
  existingHost: HTMLElement | null,
  chapters: ResolvedGeminiChapter[],
  summary: string,
  capturedAt: string,
  videoId: string
) => {
  const host = existingHost ?? document.createElement("div")
  const shouldReusePanel =
    host.dataset.capturedAt === capturedAt && host.dataset.videoId === videoId

  host.id = CHAPTER_PANEL_HOST_ID
  host.dataset.capturedAt = capturedAt
  host.dataset.videoId = videoId
  host.hidden = !generatedChapterPanelOpen

  if (!shouldReusePanel) {
    host.replaceChildren(createGeneratedChapterPanel(chapters, summary))
  }

  return host
}

const createGeneratedChapterToggle = (chapters: ResolvedGeminiChapter[]) => {
  const host = document.createElement("div")
  const button = document.createElement("button")
  const prefix = document.createElement("span")
  const content = document.createElement("div")

  host.id = CHAPTER_TOGGLE_HOST_ID
  host.className = "ytp-chapter-container"
  host.dataset.plasmoGenerated = "true"
  button.id = CHAPTER_TOGGLE_ID
  button.type = "button"
  button.className = "ytp-chapter-title ytp-button"
  button.setAttribute("aria-expanded", String(generatedChapterPanelOpen))
  button.setAttribute("aria-haspopup", "dialog")
  prefix.className = "ytp-chapter-title-prefix"
  prefix.setAttribute("aria-hidden", "true")
  prefix.textContent = "\u2022"
  content.className = "ytp-chapter-title-content"
  content.textContent = chapters[0]?.title ?? "Chapters"

  button.addEventListener("click", () => {
    setGeneratedChapterPanelVisibility(!generatedChapterPanelOpen)
  })

  button.append(prefix, content)
  host.append(button)

  return host
}

const createGeneratedChapterTimeline = (
  chapters: ResolvedGeminiChapter[],
  capturedAt: string
) => {
  const timeline = document.createElement("div")

  timeline.id = CHAPTER_TIMELINE_ID
  timeline.dataset.plasmoGenerated = "true"
  timeline.dataset.capturedAt = capturedAt

  for (const [index, chapter] of chapters.entries()) {
    const segment = document.createElement("div")
    const padding = document.createElement("div")
    const progressList = document.createElement("div")
    const playProgress = document.createElement("div")
    const liveBuffer = document.createElement("div")
    const loadProgress = document.createElement("div")
    const hoverProgress = document.createElement("div")
    const adProgress = document.createElement("div")
    const chapterDuration = Math.max(
      1,
      chapter.endSeconds - chapter.startSeconds
    )

    segment.className =
      "ytp-chapter-hover-container ytp-exp-chapter-hover-container plasmo-ai-chapter-segment"
    segment.dataset.chapterTitle = chapter.title
    segment.dataset.startSeconds = String(chapter.startSeconds)
    segment.dataset.endSeconds = String(chapter.endSeconds)
    segment.style.setProperty("--chapter-flex", String(chapterDuration))
    segment.title = `${chapter.title} (${chapter.start})`

    padding.className = "ytp-progress-bar-padding"
    progressList.className = `ytp-progress-list${index === 0 ? " ytp-progress-bar-start" : ""}${index === chapters.length - 1 ? " ytp-progress-bar-end" : ""}`
    playProgress.className = "ytp-play-progress ytp-swatch-background-color"
    liveBuffer.className = "ytp-progress-linear-live-buffer"
    loadProgress.className = "ytp-load-progress"
    hoverProgress.className = "ytp-hover-progress ytp-hover-progress-light"
    adProgress.className = "ytp-ad-progress-list"

    playProgress.style.transform = "scaleX(0)"
    loadProgress.style.transform = "scaleX(0)"
    hoverProgress.style.display = "none"

    progressList.append(
      playProgress,
      liveBuffer,
      loadProgress,
      hoverProgress,
      adProgress
    )
    segment.append(padding, progressList)
    timeline.append(segment)
  }

  return timeline
}

const mountGeneratedChapterPanel = async () => {
  const mountSequence = ++generatedChapterMountSequence

  if (!isYoutubeWatchPage()) {
    generatedChapterPanelOpen = false
    removeGeneratedChapterUi()
    unbindGeneratedChapterSync()
    unbindGeneratedChapterHoverSync()
    unbindGeneratedChapterTooltipSync()

    return
  }

  const videoId = getCurrentYoutubeVideoId()

  if (!videoId || hasNativeYoutubeChapters()) {
    generatedChapterPanelOpen = false
    removeGeneratedChapterUi()
    unbindGeneratedChapterSync()
    unbindGeneratedChapterHoverSync()
    unbindGeneratedChapterTooltipSync()

    return
  }

  const storedResults =
    (await getLocalStorageValue<StoredGeminiChapterResults>(
      GEMINI_VIDEO_CHAPTERS_KEY
    )) ?? {}

  if (
    mountSequence !== generatedChapterMountSequence ||
    !isYoutubeWatchPage()
  ) {
    return
  }

  const chapterResult = storedResults[videoId]

  if (!chapterResult || chapterResult.chapters.length === 0) {
    generatedChapterPanelOpen = false
    removeGeneratedChapterUi()
    unbindGeneratedChapterSync()
    unbindGeneratedChapterHoverSync()
    unbindGeneratedChapterTooltipSync()

    return
  }

  const resolvedChapters = resolveGeminiChapters(
    chapterResult.chapters,
    getVideoDurationSeconds()
  )

  if (resolvedChapters.length === 0) {
    generatedChapterPanelOpen = false
    removeGeneratedChapterUi()
    unbindGeneratedChapterSync()
    unbindGeneratedChapterHoverSync()
    unbindGeneratedChapterTooltipSync()

    return
  }

  injectButtonStyles()

  const existingHost = document.getElementById(CHAPTER_PANEL_HOST_ID)
  const capturedAt = String(chapterResult.capturedAt)
  const toggleMountTarget = findChapterToggleMountTarget()
  const timelineMountTarget = findChapterTimelineMountTarget()
  const panelMountTarget = findChapterPanelMountTarget()

  if (existingHost?.dataset.capturedAt !== capturedAt) {
    generatedChapterPanelOpen = false
  }

  if (toggleMountTarget) {
    const existingToggleHost = document.getElementById(CHAPTER_TOGGLE_HOST_ID)
    const toggleHost = syncGeneratedChapterToggleHost(
      existingToggleHost,
      resolvedChapters
    )

    if (toggleMountTarget.matches(".ytp-time-display")) {
      if (
        toggleHost.parentElement !== toggleMountTarget.parentElement ||
        toggleMountTarget.nextElementSibling !== toggleHost
      ) {
        toggleMountTarget.insertAdjacentElement("afterend", toggleHost)
      }
    } else if (toggleMountTarget.matches(".ytp-left-controls")) {
      const timeDisplay =
        toggleMountTarget.querySelector<HTMLElement>(".ytp-time-display")

      if (timeDisplay) {
        if (
          toggleHost.parentElement !== timeDisplay.parentElement ||
          timeDisplay.nextElementSibling !== toggleHost
        ) {
          timeDisplay.insertAdjacentElement("afterend", toggleHost)
        }
      } else if (toggleHost.parentElement !== toggleMountTarget) {
        toggleMountTarget.append(toggleHost)
      }
    } else if (toggleHost.parentElement !== toggleMountTarget) {
      toggleMountTarget.append(toggleHost)
    }
  }

  if (timelineMountTarget) {
    const existingTimeline = document.getElementById(CHAPTER_TIMELINE_ID)
    const timeline =
      existingTimeline?.dataset.capturedAt === capturedAt
        ? existingTimeline
        : createGeneratedChapterTimeline(resolvedChapters, capturedAt)
    const timelineHost = timelineMountTarget.matches(".ytp-progress-bar")
      ? (() => {
          const host = document.createElement("div")

          host.className = "ytp-chapters-container"
          host.dataset.plasmoGenerated = "true"

          return host
        })()
      : timelineMountTarget

    if (timelineHost instanceof HTMLElement) {
      timelineHost.style.position = timelineHost.style.position || "relative"

      if (timelineHost.matches(".ytp-chapters-container")) {
        restoreGeneratedTimelineBaseSegments(timelineHost)

        for (const child of Array.from(timelineHost.children)) {
          if (!(child instanceof HTMLElement)) {
            continue
          }

          if (
            child.id === CHAPTER_TIMELINE_ID ||
            child.dataset.plasmoGenerated === "true"
          ) {
            continue
          }

          child.dataset.plasmoOriginalDisplay = child.style.display
          child.style.display = "none"
          child.setAttribute(GENERATED_TIMELINE_HIDDEN_ATTR, "true")
        }
      }
    }

    if (existingTimeline && existingTimeline !== timeline) {
      existingTimeline.replaceWith(timeline)
    } else if (
      timelineMountTarget.matches(".ytp-progress-bar") &&
      timeline.parentElement !== timelineHost
    ) {
      timelineHost.append(timeline)
      timelineMountTarget.prepend(timelineHost)
    } else if (
      !timelineMountTarget.matches(".ytp-progress-bar") &&
      timeline.parentElement !== timelineMountTarget
    ) {
      timelineMountTarget.append(timeline)
    }
  }

  if (panelMountTarget) {
    const host = syncGeneratedChapterPanelHost(
      existingHost,
      resolvedChapters,
      chapterResult.summary,
      capturedAt,
      videoId
    )

    if (
      panelMountTarget.id === "meta-contents" ||
      panelMountTarget.id === "above-the-fold" ||
      panelMountTarget.tagName === "YTD-WATCH-METADATA"
    ) {
      if (
        host.parentElement !== panelMountTarget.parentElement ||
        panelMountTarget.nextElementSibling !== host
      ) {
        panelMountTarget.insertAdjacentElement("afterend", host)
      }
    } else if (host.parentElement !== panelMountTarget) {
      panelMountTarget.prepend(host)
    }
  }

  bindGeneratedChapterSync(resolvedChapters)
  bindGeneratedChapterHoverSync(resolvedChapters)
  bindGeneratedChapterTooltipSync(resolvedChapters)
  setGeneratedChapterPanelVisibility(generatedChapterPanelOpen)
}

const scheduleYoutubeRefresh = () => {
  if (youtubeRefreshScheduled) {
    return
  }

  youtubeRefreshScheduled = true

  window.setTimeout(() => {
    youtubeRefreshScheduled = false
    mountYoutubeSummaryButton()
    void mountGeneratedChapterPanel()
  }, 150)
}

const createSummaryButtonHost = () => {
  const host = document.createElement("div")
  const button = document.createElement("button")

  host.id = SUMMARY_BUTTON_HOST_ID
  button.id = SUMMARY_BUTTON_ID
  button.type = "button"
  button.textContent = "Generate chapters"
  button.setAttribute(
    "aria-label",
    "Generate chapters for this video with Gemini"
  )
  button.dataset.state = "idle"

  button.addEventListener("click", async () => {
    const videoUrl = window.location.href
    const videoId = extractYoutubeVideoId(videoUrl)

    if (!videoId) {
      updateSummaryButton("Unsupported video", "error", false)
      scheduleButtonReset()

      return
    }

    const requestId = createGeminiRequestId()

    updateSummaryButton("Opening Gemini...", "busy", true)

    try {
      await copyTextToClipboard(videoUrl)

      const response = await sendMessage<{ error?: string; ok: boolean }>({
        payload: {
          createdAt: Date.now(),
          prompt: buildGeminiPrompt(videoUrl, requestId),
          requestId,
          videoId,
          videoUrl
        },
        type: "OPEN_GEMINI_SUMMARY"
      })

      if (!response.ok) {
        throw new Error(response.error ?? "Could not open Gemini")
      }

      updateSummaryButton("Chapters queued", "success", false)
      scheduleButtonReset()
    } catch (error) {
      console.error("Failed to open Gemini chapter flow", error)
      updateSummaryButton("Try again", "error", false)
      scheduleButtonReset()
    }
  })

  host.append(button)

  return host
}

const mountYoutubeSummaryButton = () => {
  const existingHost = document.getElementById(SUMMARY_BUTTON_HOST_ID)

  if (!isYoutubeWatchPage()) {
    existingHost?.remove()

    return
  }

  if (hasNativeYoutubeChapters()) {
    existingHost?.remove()

    return
  }

  const actionRow = findYoutubeActionRow()

  if (!actionRow) {
    return
  }

  injectButtonStyles()

  const host = existingHost ?? createSummaryButtonHost()
  const firstChild = actionRow.firstElementChild

  if (host.parentElement !== actionRow) {
    actionRow.insertBefore(host, firstChild)
  } else if (firstChild !== host) {
    actionRow.insertBefore(host, firstChild)
  }
}

const findGeminiComposer = () => {
  const selectors = [
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"][aria-label]',
    "rich-textarea div[contenteditable='true']",
    "textarea",
    'input[type="text"]'
  ]

  for (const selector of selectors) {
    const matches = document.querySelectorAll(selector)

    for (const match of matches) {
      if (isVisible(match)) {
        return match as HTMLElement
      }
    }
  }

  return null
}

const findGeminiSubmitButton = () => {
  const selectors = [
    'button[aria-label*="Send" i]',
    'button[aria-label*="Submit" i]',
    'button[data-testid*="send" i]',
    'button[mattooltip*="Send" i]',
    'button[title*="Send" i]'
  ]

  for (const selector of selectors) {
    const matches = document.querySelectorAll(selector)

    for (const match of matches) {
      if (isVisible(match) && !(match as HTMLButtonElement).disabled) {
        return match as HTMLButtonElement
      }
    }
  }

  const fallback = Array.from(document.querySelectorAll("button")).find(
    (button) =>
      isVisible(button) && /send|submit/i.test(button.textContent ?? "")
  )

  return (fallback as HTMLButtonElement | undefined) ?? null
}

const setComposerValue = (composer: HTMLElement, prompt: string) => {
  composer.focus()

  if (
    composer instanceof HTMLTextAreaElement ||
    composer instanceof HTMLInputElement
  ) {
    composer.value = prompt
    composer.dispatchEvent(new Event("input", { bubbles: true }))
    composer.dispatchEvent(new Event("change", { bubbles: true }))

    return
  }

  document.execCommand("selectAll", false)

  const inserted = document.execCommand("insertText", false, prompt)

  if (!inserted) {
    composer.textContent = prompt
  }

  composer.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      data: prompt,
      inputType: "insertText"
    })
  )
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })

const maybeSendPromptToGemini = async () => {
  if (!isGeminiPage() || geminiAttemptInFlight) {
    return
  }

  geminiAttemptInFlight = true

  try {
    const pendingRequest =
      await getLocalStorageValue<PendingGeminiSummaryRequest>(
        PENDING_GEMINI_SUMMARY_KEY
      )

    if (!pendingRequest) {
      return
    }

    const isExpired =
      Date.now() - pendingRequest.createdAt > GEMINI_REQUEST_TTL_MS

    if (isExpired) {
      await removeLocalStorageValue(PENDING_GEMINI_SUMMARY_KEY)

      return
    }

    if (pendingRequest.createdAt <= lastHandledGeminiRequest) {
      return
    }

    const composer = findGeminiComposer()

    if (!composer) {
      return
    }

    setComposerValue(composer, pendingRequest.prompt)

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await wait(200)

      const submitButton = findGeminiSubmitButton()

      if (!submitButton) {
        continue
      }

      submitButton.click()
      lastHandledGeminiRequest = pendingRequest.createdAt
      await setLocalStorageValue(ACTIVE_GEMINI_SUMMARY_KEY, pendingRequest)
      await removeLocalStorageValue(PENDING_GEMINI_SUMMARY_KEY)

      return
    }
  } catch (error) {
    console.error("Failed to populate Gemini prompt", error)
  } finally {
    geminiAttemptInFlight = false
  }
}

const maybeCaptureGeminiResponse = async () => {
  if (!isGeminiPage() || geminiCaptureInFlight) {
    return
  }

  geminiCaptureInFlight = true

  try {
    const activeRequest =
      await getLocalStorageValue<PendingGeminiSummaryRequest>(
        ACTIVE_GEMINI_SUMMARY_KEY
      )

    if (!activeRequest) {
      return
    }

    const isExpired =
      Date.now() - activeRequest.createdAt > GEMINI_REQUEST_TTL_MS

    if (isExpired) {
      await removeLocalStorageValue(ACTIVE_GEMINI_SUMMARY_KEY)

      return
    }

    const chapterResult = extractGeminiChapterResult(activeRequest.requestId)

    if (!chapterResult) {
      return
    }

    const storedResults =
      (await getLocalStorageValue<StoredGeminiChapterResults>(
        GEMINI_VIDEO_CHAPTERS_KEY
      )) ?? {}

    storedResults[activeRequest.videoId] = {
      capturedAt: Date.now(),
      chapters: chapterResult.chapters,
      requestId: activeRequest.requestId,
      summary: chapterResult.summary,
      videoId: activeRequest.videoId,
      videoUrl: activeRequest.videoUrl
    }

    await setLocalStorageValue(GEMINI_VIDEO_CHAPTERS_KEY, storedResults)
    await removeLocalStorageValue(ACTIVE_GEMINI_SUMMARY_KEY)
  } catch (error) {
    console.error("Failed to capture Gemini response", error)
  } finally {
    geminiCaptureInFlight = false
  }
}

const scheduleGeminiResponseCapture = () => {
  if (geminiCaptureScheduled) {
    return
  }

  geminiCaptureScheduled = true

  window.setTimeout(async () => {
    geminiCaptureScheduled = false
    await maybeCaptureGeminiResponse()
  }, 300)
}

const scheduleGeminiAttempt = () => {
  if (geminiAttemptScheduled) {
    return
  }

  geminiAttemptScheduled = true

  window.setTimeout(async () => {
    geminiAttemptScheduled = false
    await maybeSendPromptToGemini()
  }, 150)
}

const installHistoryListeners = () => {
  if (historyListenersInstalled) {
    return
  }

  historyListenersInstalled = true

  const dispatchUrlChange = () => {
    window.dispatchEvent(new Event(URL_CHANGE_EVENT))
  }

  const originalPushState = history.pushState
  const originalReplaceState = history.replaceState

  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args)

    dispatchUrlChange()

    return result
  }

  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args)

    dispatchUrlChange()

    return result
  }

  window.addEventListener("popstate", dispatchUrlChange)
  window.addEventListener(URL_CHANGE_EVENT, scheduleYoutubeRefresh)
  window.addEventListener(URL_CHANGE_EVENT, scheduleGeminiAttempt)
  window.addEventListener(URL_CHANGE_EVENT, scheduleGeminiResponseCapture)
  document.addEventListener("yt-navigate-finish", scheduleYoutubeRefresh)
  document.addEventListener("yt-navigate-finish", scheduleGeminiAttempt)
  document.addEventListener("yt-navigate-finish", scheduleGeminiResponseCapture)
}

const installMutationObserver = () => {
  if (mutationObserverInstalled || !document.body) {
    return
  }

  mutationObserverInstalled = true

  const observer = new MutationObserver((mutations) => {
    if (mutations.every(shouldIgnoreMutation)) {
      return
    }

    scheduleYoutubeRefresh()
    scheduleGeminiAttempt()
    scheduleGeminiResponseCapture()
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true
  })
}

const bootstrap = () => {
  installHistoryListeners()

  if (document.readyState === "loading") {
    window.addEventListener(
      "DOMContentLoaded",
      () => {
        installMutationObserver()
        scheduleYoutubeRefresh()
        scheduleGeminiAttempt()
        scheduleGeminiResponseCapture()
      },
      { once: true }
    )

    return
  }

  installMutationObserver()
  scheduleYoutubeRefresh()
  scheduleGeminiAttempt()
  scheduleGeminiResponseCapture()
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return
  }

  if (
    Object.prototype.hasOwnProperty.call(changes, PENDING_GEMINI_SUMMARY_KEY)
  ) {
    scheduleGeminiAttempt()
  }

  if (
    Object.prototype.hasOwnProperty.call(changes, ACTIVE_GEMINI_SUMMARY_KEY)
  ) {
    scheduleGeminiResponseCapture()
  }

  if (
    Object.prototype.hasOwnProperty.call(changes, GEMINI_VIDEO_CHAPTERS_KEY)
  ) {
    scheduleYoutubeRefresh()
  }
})

bootstrap()

const Content = () => null

export default Content
