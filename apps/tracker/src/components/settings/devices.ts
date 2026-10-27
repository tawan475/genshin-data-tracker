import type { SessionMethod, SessionResponse } from '@gdt/shared'
import type { Component } from 'vue'
import { History, KeyRound, LifeBuoy, Monitor } from 'lucide-vue-next'
import { t } from '@/i18n'
import { describeUserAgent } from '@/lib/user-agent'

/** How a session signed in: an icon (Discord and Google show their marks). */
export const METHOD_ICONS: Record<SessionMethod, Component | undefined> = {
  password: KeyRound,
  discord: undefined,
  google: undefined,
  reset: LifeBuoy,
  legacy: History,
  irminsul: Monitor,
}

export const methodTitle = (method: SessionMethod): string => t(`settings.devices.method.${method}`)

/**
 * "Teyvat.me on <device>" for the capture apps (irminsul is retired: its
 * sign-ins read the same), the browser and system otherwise.
 */
export function deviceName(row: SessionResponse): string {
  if (row.method !== 'irminsul') return describeUserAgent(row.userAgent)
  return t('settings.devices.teyvatmeOn', { device: row.deviceName || t('settings.devices.aPc') })
}

/** "IP · City, CC", or '' when neither is known. */
export function devicePlace(row: SessionResponse): string {
  return [row.ip, [row.city, row.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
}

/** This device first, then the most recently seen. */
export function byRecent(a: SessionResponse, b: SessionResponse): number {
  return Number(b.current) - Number(a.current) || b.lastSeenAt - a.lastSeenAt
}
