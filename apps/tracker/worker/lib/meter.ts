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
  /** Time D1 itself spent executing SQL; the rest of a round trip is network. */
  sqlMs = 0
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
      this.sqlMs += result.meta.duration ?? 0
    }
    this.timings.push(`${label};dur=${Date.now() - started}`)
    return results
  }

  /**
   * `d1` with every query and batch counted here: for code that makes many
   * D1 calls of its own (repack), whose cost the caller reports.
   */
  wrap(d1: D1Database): D1Database {
    const count = (results: D1Result[]) => {
      this.roundTrips++
      for (const result of results) {
        this.rowsRead += result.meta.rows_read ?? 0
        this.rowsWritten += result.meta.rows_written ?? 0
        this.sqlMs += result.meta.duration ?? 0
      }
    }
    const statement = (inner: D1PreparedStatement): D1PreparedStatement => {
      const wrapped = {
        inner,
        bind: (...values: unknown[]) => statement(inner.bind(...values)),
        all: async () => {
          const result = await inner.all()
          count([result])
          return result
        },
        run: async () => {
          const result = await inner.run()
          count([result])
          return result
        },
        first: async () => {
          const result = await inner.all()
          count([result])
          return result.results[0] ?? null
        },
        raw: () => inner.raw(),
      }
      return wrapped as unknown as D1PreparedStatement
    }
    return {
      prepare: (sql: string) => statement(d1.prepare(sql)),
      batch: async (statements: D1PreparedStatement[]) => {
        const results = await d1.batch(
          statements.map((s) => (s as unknown as { inner?: D1PreparedStatement }).inner ?? s),
        )
        count(results)
        return results
      },
      exec: (sql: string) => d1.exec(sql),
    } as unknown as D1Database
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
      `round-trips=${this.roundTrips}; rows-read=${this.rowsRead}; rows-written=${this.rowsWritten}; ` +
        `sql-ms=${this.sqlMs.toFixed(1)}`,
    )
  }
}
