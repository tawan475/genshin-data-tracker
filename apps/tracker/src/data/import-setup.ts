/**
 * Account setup helpers: the account form (shared by "Add account" and
 * account settings), and what Irminsul needs to upload on its own.
 */

import { accountInput, GENSHIN_SERVERS, type GenshinServer } from '@gdt/shared'
import type { AccountInput } from '@/api'

/**
 * The base URL Irminsul posts to. It appends `/genshin-accounts-public/...`
 * itself, so this is the site's own `/api` (https://genshin-tracker.475.dev/api
 * in production).
 */
export function trackerApiUrl(): string {
  return `${window.location.origin}/api`
}

export const SERVER_LABELS: Record<GenshinServer, string> = {
  AMERICA: 'America',
  EUROPE: 'Europe',
  ASIA: 'Asia',
  SAR: 'TW, HK, MO',
}

export const SERVER_OPTIONS: { value: GenshinServer | null; label: string }[] = [
  { value: null, label: 'Not set' },
  ...GENSHIN_SERVERS.map((value) => ({ value, label: SERVER_LABELS[value] })),
]

export interface AccountFormValues {
  name: string
  uid: string
  server: GenshinServer | null
}

export type AccountFormErrors = Partial<Record<keyof AccountFormValues, string>>

const FIELD_MESSAGES: Record<keyof AccountFormValues, string> = {
  name: 'Max 64 characters',
  uid: '9 or 10 digits',
  server: 'Pick a server',
}

export function emptyAccountForm(): AccountFormValues {
  return { name: '', uid: '', server: null }
}

/** Normalises the form the way the server stores it: blank fields become null. */
export function accountFormInput(values: AccountFormValues): AccountInput {
  return {
    name: values.name.trim() || null,
    uid: values.uid.replace(/\s+/g, '') || null,
    server: values.server,
  }
}

/** Validates against the same schema the Worker uses. */
export function validateAccountForm(
  values: AccountFormValues,
): { ok: true; input: AccountInput } | { ok: false; errors: AccountFormErrors } {
  const input = accountFormInput(values)
  const result = accountInput.safeParse(input)
  if (result.success) return { ok: true, input }
  const errors: AccountFormErrors = {}
  for (const issue of result.error.issues) {
    const field = issue.path[0]
    if (field === 'name' || field === 'uid' || field === 'server') {
      errors[field] ??= FIELD_MESSAGES[field]
    }
  }
  return { ok: false, errors }
}

/**
 * Copies text. Falls back to selecting `element` and the legacy copy command
 * where the Clipboard API is missing (plain-http origins); false if both fail,
 * with the text left selected for a manual copy.
 */
export async function copyText(text: string, element?: HTMLElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permission denied or not focused: fall through to the selection route.
  }
  if (!element) return false
  const selection = window.getSelection()
  selection?.selectAllChildren(element)
  try {
    return document.execCommand('copy')
  } catch {
    return false
  }
}
