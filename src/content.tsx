import type { PlasmoCSConfig } from "plasmo"

import {
  buildGeminiPrompt,
  PENDING_GEMINI_SUMMARY_KEY,
  type PendingGeminiSummaryRequest
} from "~gemini-workflow"

export const config: PlasmoCSConfig = {
  matches: ["https://www.youtube.com/*", "https://gemini.google.com/*"]
}

const GEMINI_REQUEST_TTL_MS = 15 * 60 * 1000
const SUMMARY_BUTTON_HOST_ID = "plasmo-summarize-youtube-host"
const SUMMARY_BUTTON_ID = "plasmo-summarize-youtube-button"
const SUMMARY_BUTTON_STYLE_ID = "plasmo-summarize-youtube-style"
const URL_CHANGE_EVENT = "plasmo:urlchange"

let buttonResetTimeout: number | null = null
let geminiAttemptScheduled = false
let geminiAttemptInFlight = false
let historyListenersInstalled = false
let mutationObserverInstalled = false
let lastHandledGeminiRequest = 0

const isYoutubeWatchPage = () =>
  window.location.hostname === "www.youtube.com" &&
  window.location.pathname === "/watch"

const isGeminiPage = () => window.location.hostname === "gemini.google.com"

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
    updateSummaryButton("Summarize with Gemini", "idle", false)
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

const createSummaryButtonHost = () => {
  const host = document.createElement("div")
  const button = document.createElement("button")

  host.id = SUMMARY_BUTTON_HOST_ID
  button.id = SUMMARY_BUTTON_ID
  button.type = "button"
  button.textContent = "Summarize with Gemini"
  button.setAttribute("aria-label", "Summarize this video with Gemini")
  button.dataset.state = "idle"

  button.addEventListener("click", async () => {
    const videoUrl = window.location.href

    updateSummaryButton("Opening Gemini...", "busy", true)

    try {
      await copyTextToClipboard(videoUrl)

      const response = await sendMessage<{ error?: string; ok: boolean }>({
        payload: {
          createdAt: Date.now(),
          prompt: buildGeminiPrompt(videoUrl),
          videoUrl
        },
        type: "OPEN_GEMINI_SUMMARY"
      })

      if (!response.ok) {
        throw new Error(response.error ?? "Could not open Gemini")
      }

      updateSummaryButton("Sent to Gemini", "success", false)
      scheduleButtonReset()
    } catch (error) {
      console.error("Failed to open Gemini summary flow", error)
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
      await removeLocalStorageValue(PENDING_GEMINI_SUMMARY_KEY)

      return
    }
  } catch (error) {
    console.error("Failed to populate Gemini prompt", error)
  } finally {
    geminiAttemptInFlight = false
  }
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
  window.addEventListener(URL_CHANGE_EVENT, mountYoutubeSummaryButton)
  window.addEventListener(URL_CHANGE_EVENT, scheduleGeminiAttempt)
  document.addEventListener("yt-navigate-finish", mountYoutubeSummaryButton)
  document.addEventListener("yt-navigate-finish", scheduleGeminiAttempt)
}

const installMutationObserver = () => {
  if (mutationObserverInstalled || !document.body) {
    return
  }

  mutationObserverInstalled = true

  const observer = new MutationObserver(() => {
    mountYoutubeSummaryButton()
    scheduleGeminiAttempt()
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
        mountYoutubeSummaryButton()
        scheduleGeminiAttempt()
      },
      { once: true }
    )

    return
  }

  installMutationObserver()
  mountYoutubeSummaryButton()
  scheduleGeminiAttempt()
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (
    areaName === "local" &&
    Object.prototype.hasOwnProperty.call(changes, PENDING_GEMINI_SUMMARY_KEY)
  ) {
    scheduleGeminiAttempt()
  }
})

bootstrap()
