import {
  GEMINI_APP_URL,
  PENDING_GEMINI_SUMMARY_KEY,
  type PendingGeminiSummaryRequest
} from "~gemini-workflow"

type OpenGeminiSummaryMessage = {
  payload: PendingGeminiSummaryRequest
  type: "OPEN_GEMINI_SUMMARY"
}

const isOpenGeminiSummaryMessage = (
  value: unknown
): value is OpenGeminiSummaryMessage => {
  if (!value || typeof value !== "object") {
    return false
  }

  return (value as OpenGeminiSummaryMessage).type === "OPEN_GEMINI_SUMMARY"
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isOpenGeminiSummaryMessage(message)) {
    return
  }

  chrome.storage.local.set(
    {
      [PENDING_GEMINI_SUMMARY_KEY]: message.payload
    },
    () => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message, ok: false })

        return
      }

      chrome.tabs.create({ active: false, url: GEMINI_APP_URL }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message, ok: false })

          return
        }

        sendResponse({ ok: true })
      })
    }
  )

  return true
})

export {}
