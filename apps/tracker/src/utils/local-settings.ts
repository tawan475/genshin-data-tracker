import {
  ACCOUNT_SETTINGS_DEFAULTS,
  MATERIALS_GRAPH_DEFAULTS,
  USER_SETTINGS_DEFAULTS,
  type AccountSettings,
  type MaterialsGraphSettings,
  type UserSettings,
} from '../types/settings'

const KEYS = {
  userTheme: 'gdt:user:theme',
  userUse24Hour: 'gdt:user:use24Hour',
  userInitialized: 'gdt:user:initialized',
  accountSettings: (accountId: number) => `gdt:account:${accountId}:settings`,
} as const

const LEGACY_THEME = 'theme'
const LEGACY_USE_24H = 'use24Hour'

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore quota / private mode
  }
}

export function clearAllLocalSettings(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('gdt:') || key === LEGACY_THEME || key === LEGACY_USE_24H)) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      safeRemove(key)
    }
  } catch {
    // ignore
  }
}

function migrateLegacyUserSettings(): Partial<UserSettings> {
  const migrated: Partial<UserSettings> = {}
  const legacyTheme = safeGet(LEGACY_THEME)
  const legacy24 = safeGet(LEGACY_USE_24H)

  if (legacyTheme === 'dark' || legacyTheme === 'light') {
    migrated.theme = legacyTheme
    safeSet(KEYS.userTheme, legacyTheme)
  }
  if (legacy24 != null) {
    migrated.use24Hour = legacy24 === 'true'
    safeSet(KEYS.userUse24Hour, String(migrated.use24Hour))
  }

  return migrated
}

export function hasLocalUserSettings(): boolean {
  return safeGet(KEYS.userInitialized) === 'true'
}

export function markLocalUserSettingsInitialized(): void {
  safeSet(KEYS.userInitialized, 'true')
}

export function readUserSettings(): Partial<UserSettings> {
  const migrated = migrateLegacyUserSettings()
  const theme = safeGet(KEYS.userTheme)
  const use24Hour = safeGet(KEYS.userUse24Hour)

  return {
    theme:
      theme === 'dark' || theme === 'light'
        ? theme
        : migrated.theme ?? USER_SETTINGS_DEFAULTS.theme,
    use24Hour:
      use24Hour != null
        ? use24Hour === 'true'
        : migrated.use24Hour ?? USER_SETTINGS_DEFAULTS.use24Hour,
  }
}

export function writeUserSettings(partial: Partial<UserSettings>): void {
  if (partial.theme != null) {
    safeSet(KEYS.userTheme, partial.theme)
  }
  if (partial.use24Hour != null) {
    safeSet(KEYS.userUse24Hour, String(partial.use24Hour))
  }
  markLocalUserSettingsInitialized()
}

export function readAccountSettings(accountId: number): AccountSettings | null {
  const raw = safeGet(KEYS.accountSettings(accountId))
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<AccountSettings>
    return {
      materialsGraph: {
        ...MATERIALS_GRAPH_DEFAULTS,
        ...(parsed.materialsGraph ?? {}),
      },
    }
  } catch {
    return null
  }
}

export function writeAccountSettings(
  accountId: number,
  partial: { materialsGraph?: Partial<MaterialsGraphSettings> },
): AccountSettings {
  const current =
    readAccountSettings(accountId) ?? {
      materialsGraph: { ...ACCOUNT_SETTINGS_DEFAULTS.materialsGraph },
    }

  const merged: AccountSettings = {
    materialsGraph: {
      ...current.materialsGraph,
      ...(partial.materialsGraph ?? {}),
    },
  }

  safeSet(KEYS.accountSettings(accountId), JSON.stringify(merged))
  return merged
}

export function accountSettingsDiffer(
  a: AccountSettings,
  b: AccountSettings,
): boolean {
  const ma = a.materialsGraph
  const mb = b.materialsGraph
  if (ma.groupBy !== mb.groupBy || ma.limit !== mb.limit) return true
  if (ma.selectedKeys.length !== mb.selectedKeys.length) return true
  return ma.selectedKeys.some((k, i) => k !== mb.selectedKeys[i])
}

export function userSettingsDiffer(
  local: UserSettings,
  server: Partial<UserSettings>,
): boolean {
  if (server.theme != null && server.theme !== local.theme) return true
  if (server.use24Hour != null && server.use24Hour !== local.use24Hour) return true
  return false
}
