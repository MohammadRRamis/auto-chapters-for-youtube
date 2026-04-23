export const GEMINI_APP_URL = "https://gemini.google.com/app"

export const PENDING_GEMINI_SUMMARY_KEY = "pending-gemini-summary-request"
export const ACTIVE_GEMINI_SUMMARY_KEY = "active-gemini-summary-request"
export const GEMINI_VIDEO_CHAPTERS_KEY = "gemini-video-chapters"

export type GeminiChapter = {
  end?: string
  start: string
  title: string
}

export type GeminiVideoChapterResult = {
  capturedAt: number
  chapters: GeminiChapter[]
  requestId: string
  summary: string
  videoId: string
  videoUrl: string
}

export type StoredGeminiChapterResults = Record<
  string,
  GeminiVideoChapterResult
>

export type PendingGeminiSummaryRequest = {
  createdAt: number
  prompt: string
  requestId: string
  videoId: string
  videoUrl: string
}

export const extractYoutubeVideoId = (videoUrl: string) => {
  try {
    const url = new URL(videoUrl)

    if (url.hostname !== "www.youtube.com" || url.pathname !== "/watch") {
      return null
    }

    return url.searchParams.get("v")
  } catch {
    return null
  }
}

export const buildGeminiPrompt = (videoUrl: string, requestId: string) =>
  [
    "Generate timestamps and chapters for this YouTube video.",
    "Provide a concise overview first.",
    "Then create a fallback chapter list for videos that do not already have native YouTube chapters.",
    "Return exactly two sections in this order:",
    "1. OVERVIEW: plain text only.",
    '2. CHAPTERS_JSON: one ```json``` code block containing {"requestId":"string","chapters":[{"start":"MM:SS or HH:MM:SS","end":"MM:SS or HH:MM:SS","title":"string"}]}',
    `Use this exact requestId value in the JSON: ${requestId}`,
    "List chapters in chronological order.",
    "Favor useful navigation points over broad summarization.",
    "Every chapter must include a start time and a title. Include end only when it is clear.",
    "If the transcript or page context is too weak to infer reliable chapters, return an empty chapters array instead of guessing.",
    `Video URL: ${videoUrl}`
  ].join("\n\n")
