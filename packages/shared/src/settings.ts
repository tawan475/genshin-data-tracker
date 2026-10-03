/**
 * User and account settings. Stored as JSON on the server, cached in
 * localStorage on the client; both sides merge what they load against these
 * defaults, so a missing or partial stored object is always valid.
 */

export type TimelineGroupBy = 'hour' | 'day' | 'month' | 'year'

export interface MaterialsGraphSettings {
  selectedKeys: string[]
  groupBy: TimelineGroupBy
  limit: number
}

export interface AccountSettings {
  materialsGraph: MaterialsGraphSettings
}

export interface UserSettings {
  theme: 'light' | 'dark'
  use24Hour: boolean
}

/** What a PATCH may carry: any subset, nested objects included. */
export type UserSettingsPatch = Partial<UserSettings>
export interface AccountSettingsPatch {
  materialsGraph?: Partial<MaterialsGraphSettings>
}

export const USER_SETTINGS_DEFAULTS: UserSettings = {
  theme: 'light',
  use24Hour: false,
}

export const MATERIALS_GRAPH_DEFAULTS: MaterialsGraphSettings = {
  selectedKeys: [],
  groupBy: 'day',
  limit: 365,
}

export const ACCOUNT_SETTINGS_DEFAULTS: AccountSettings = {
  materialsGraph: MATERIALS_GRAPH_DEFAULTS,
}

/**
 * Recursively merges `patch` over `base`. Plain objects merge key by key;
 * arrays and scalars replace; `undefined` in the patch leaves the base value.
 */
export function deepMerge<T extends object>(base: T, patch: object): T {
  const result = { ...base } as Record<string, unknown>

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const existing = result[key]
    if (isPlainObject(value) && isPlainObject(existing)) {
      result[key] = deepMerge(existing, value)
    } else {
      result[key] = value
    }
  }

  return result as T
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
