export const CORK_DETAIL_REQUEST_DELAY_MS = 1_000
export const CORK_RATE_LIMIT_BACKOFF_MS = [2_000, 4_000, 8_000, 16_000] as const

export class CorkRequestThrottle {
  private nextRequestAt = 0

  constructor(
    private readonly delayMs = CORK_DETAIL_REQUEST_DELAY_MS,
    private readonly now = () => Date.now(),
    private readonly wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
  ) {}

  async waitForTurn() {
    const delay = Math.max(0, this.nextRequestAt - this.now())
    if (delay > 0) await this.wait(delay)
    this.nextRequestAt = this.now() + this.delayMs
  }
}

export function retryAfterDelayMs(value: string | null, now = Date.now()) {
  if (!value) return null
  const seconds = Number(value.trim())
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000

  const retryAt = Date.parse(value)
  if (!Number.isNaN(retryAt)) return Math.max(0, retryAt - now)
  return null
}

export function corkRetryDelayMs(attempt: number, retryAfter: string | null, now = Date.now()) {
  return retryAfterDelayMs(retryAfter, now) ?? CORK_RATE_LIMIT_BACKOFF_MS[Math.min(Math.max(attempt - 1, 0), CORK_RATE_LIMIT_BACKOFF_MS.length - 1)]
}
