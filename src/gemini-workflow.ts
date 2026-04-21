export const GEMINI_APP_URL = "https://gemini.google.com/app"

export const PENDING_GEMINI_SUMMARY_KEY = "pending-gemini-summary-request"

export type PendingGeminiSummaryRequest = {
  createdAt: number
  prompt: string
  videoUrl: string
}

export const buildGeminiPrompt = (videoUrl: string) =>
  [
    "Summarize this YouTube video.",
    "Provide a concise overview first, then list the main takeaways, any action items, and notable timestamps or quoted claims if they are clear from the transcript or page context.",
    `Video URL: ${videoUrl}`
  ].join("\n\n")
