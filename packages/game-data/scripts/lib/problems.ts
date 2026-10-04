/**
 * Collects what a build found wrong. Errors fail the build (nothing in data/
 * is written); warnings are printed and worth a look after every refresh.
 */
export class Problems {
  readonly errors: string[] = []
  readonly warnings: string[] = []

  error(message: string): void {
    this.errors.push(message)
  }

  warn(message: string): void {
    this.warnings.push(message)
  }

  get ok(): boolean {
    return this.errors.length === 0
  }

  print(): void {
    for (const warning of this.warnings) console.warn(`  warning: ${warning}`)
    for (const error of this.errors) console.error(`  ERROR: ${error}`)
  }
}
