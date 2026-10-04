/**
 * Polite HTTP for the build scripts: a User-Agent that says who we are,
 * bounded concurrency, and retries with exponential backoff.
 */

export const USER_AGENT = 'gdt-game-data (+https://genshin-tracker.475.dev)'

export class HttpError extends Error {
  readonly status: number
  readonly url: string
  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`)
    this.name = 'HttpError'
    this.status = status
    this.url = url
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface GetOptions {
  /** Tries in total, including the first (default 5). */
  attempts?: number
  /** Per-try timeout (default 2 minutes; the text maps are large). */
  timeoutMs?: number
  /** Extra request headers. */
  headers?: Record<string, string>
  /** HEAD only asks whether the URL exists (default GET). */
  method?: 'GET' | 'HEAD'
}

/**
 * GET (or HEAD) a URL. Returns null on 404; retries network errors, 429 and 5xx
 * (honouring Retry-After) with 1 s, 2 s, 4 s… backoff; throws HttpError on any
 * other status or when the tries run out.
 */
export async function get(url: string, options: GetOptions = {}): Promise<Response | null> {
  const attempts = options.attempts ?? 5
  const timeoutMs = options.timeoutMs ?? 120_000
  let delay = 1000
  for (let attempt = 1; ; attempt++) {
    let wait = delay
    try {
      const response = await fetch(url, {
        method: options.method ?? 'GET',
        headers: { 'user-agent': USER_AGENT, ...options.headers },
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (response.status === 404) {
        await response.body?.cancel()
        return null
      }
      if (response.ok) return response
      await response.body?.cancel()
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || attempt >= attempts) throw new HttpError(response.status, url)
      const retryAfter = Number(response.headers.get('retry-after'))
      if (Number.isFinite(retryAfter) && retryAfter > 0) wait = retryAfter * 1000
    } catch (error) {
      if (error instanceof HttpError || attempt >= attempts) throw error
    }
    await sleep(wait)
    delay *= 2
  }
}

/** Runs `run` over `items` with at most `concurrency` calls in flight. */
export async function pool<T>(
  items: readonly T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      await run(items[index] as T, index)
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, worker),
  )
}
