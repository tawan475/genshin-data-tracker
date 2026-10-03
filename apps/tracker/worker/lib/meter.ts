import type { Context } from 'hono'
import type { AppEnv } from '../env'
import { diagKeyOk } from '../routes/health'

/**
 * Counts what a request costs in D1: round trips, rows read and written (what
 * D1 bills), and the wall time of each round trip. Inside a Worker the clock
 * only advances across I/O, so these timings are D1 latency, not CPU.
 */
export class D1Meter {
  roundTrips = 0
  rowsRead = 0
  rowsWritten = 0
  private readonly timings: string[] = []

  async batch<T = Record<string, unknown>>(
    d1: D1Database,
    label: string,
    statements: D1PreparedStatement[],
  ): Promise<D1Result<T>[]> {
    const started = Date.now()
    const results = await d1.batch<T>(statements)
    this.roundTrips++
    for (const result of results) {
      this.rowsRead += result.meta.rows_read ?? 0
      this.rowsWritten += result.meta.rows_written ?? 0
    }
    this.timings.push(`${label};dur=${Date.now() - started}`)
    return results
  }

  /**
   * Adds Server-Timing and x-gdt-d1 headers, but only for a request carrying
   * the diag key (as aru.gg does): costs are diagnostics, not public data.
   */
  report(c: Context<AppEnv>): void {
    if (!diagKeyOk(c.req.header('x-diag-key'), c.env.DIAG_KEY)) return
    c.header('Server-Timing', this.timings.join(', '))
    c.header(
      'x-gdt-d1',
      `round-trips=${this.roundTrips}; rows-read=${this.rowsRead}; rows-written=${this.rowsWritten}`,
    )
  }
}
