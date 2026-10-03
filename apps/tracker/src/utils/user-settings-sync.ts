import { applyDocumentTheme } from '../bootstrap-theme'
import { USER_SETTINGS_DEFAULTS, type UserSettings } from '../types/settings'
import { clearAllLocalSettings, writeUserSettings } from './local-settings'

export async function adoptUserSettingsOnLogin(
  apiUrl: string,
  accessToken: string,
): Promise<UserSettings> {
  clearAllLocalSettings()

  let adopted: UserSettings = { ...USER_SETTINGS_DEFAULTS }

  try {
    const res = await fetch(`${apiUrl}/users/me/settings`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (res.ok) {
      const parsed = await res.json()
      const server = (parsed.data ?? parsed) as Partial<UserSettings>
      adopted = {
        theme: server.theme ?? USER_SETTINGS_DEFAULTS.theme,
        use24Hour: server.use24Hour ?? USER_SETTINGS_DEFAULTS.use24Hour,
      }
    }
  } catch (err) {
    console.error('Failed to load user settings on login', err)
  }

  writeUserSettings(adopted)
  applyDocumentTheme(adopted.theme)
  return adopted
}
