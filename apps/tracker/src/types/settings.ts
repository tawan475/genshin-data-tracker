/** Local-first: cached per account in localStorage; server syncs in background. */
export type TimelineGroupBy = 'hour' | 'day' | 'month' | 'year'

export interface MaterialsGraphSettings {
  selectedKeys: string[]
  groupBy: TimelineGroupBy
  limit: number
}

export interface AccountSettings {
  materialsGraph: MaterialsGraphSettings
}

/** Local-first on device; background GET/PATCH when logged in. */
export interface UserSettings {
  theme: 'light' | 'dark'
  use24Hour: boolean
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
