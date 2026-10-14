import type { GenshinServer } from '@gdt/shared'
import { t } from '@/i18n'

/** The original tracker's select order. */
const ORDER: readonly GenshinServer[] = ['ASIA', 'AMERICA', 'EUROPE', 'SAR']

/** The original tracker's server names, in its select order, in the language on screen. */
export function serverOptions(): Record<GenshinServer, string> {
  return Object.fromEntries(ORDER.map((s) => [s, serverName(s)])) as Record<GenshinServer, string>
}

export function serverName(server: GenshinServer | null): string {
  return server ? t(`accounts.server.${server}`) : ''
}
