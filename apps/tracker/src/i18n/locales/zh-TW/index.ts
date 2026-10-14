// Loaded on demand (its own chunk); missing keys fall back to English.
import common from './common.json'
import errors from './errors.json'
import format from './format.json'
import game from './game.json'
import shell from './shell.json'
import auth from './auth.json'
import settings from './settings.json'
import accounts from './accounts.json'
import characters from './characters.json'
import weapons from './weapons.json'
import artifacts from './artifacts.json'
import materials from './materials.json'
import overview from './overview.json'
import progression from './progression.json'
import achievements from './achievements.json'
import planner from './planner.json'
import farm from './farm.json'
import staff from './staff.json'

const messages: Record<string, unknown> = {
  common,
  errors,
  format,
  game,
  shell,
  auth,
  settings,
  accounts,
  characters,
  weapons,
  artifacts,
  materials,
  overview,
  progression,
  achievements,
  planner,
  farm,
  staff,
}

export default messages
