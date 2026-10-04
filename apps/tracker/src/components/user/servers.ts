import type { GenshinServer } from '@gdt/shared'

/** The original tracker's server names, in its select order. */
export const SERVER_OPTIONS: Record<GenshinServer, string> = {
  ASIA: 'Asia',
  AMERICA: 'America',
  EUROPE: 'Europe',
  SAR: 'TW/HK/MO',
}

export function serverName(server: GenshinServer | null): string {
  return server ? SERVER_OPTIONS[server] : ''
}
