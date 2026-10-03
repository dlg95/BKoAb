/** Error with the HTTP status and the human-readable FastAPI `detail` as message. */
export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

/** Turns a FastAPI error body (`{"detail": ...}`) into a readable German message. */
export function parseErrorDetail(text: string, fallback: string): string {
  if (!text) return fallback
  try {
    const parsed = JSON.parse(text) as { detail?: unknown }
    const detail = parsed.detail
    if (typeof detail === "string") return detail
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          const msg = (item as { msg?: string }).msg ?? ""
          return msg.replace(/^Value error, /, "")
        })
        .filter(Boolean)
        .join(" · ") || fallback
    }
  } catch {
    /* plain text body */
  }
  return text
}

/** Message for UI display from any thrown value. */
export function errorMessage(error: unknown, fallback = "Unbekannter Fehler"): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}
