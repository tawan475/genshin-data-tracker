import materialKeys from './data/materials.json'
import { createDictionary } from './index'

/**
 * Kept out of the main entry point: the list is ~7,600 keys, so the browser
 * should only load it on pages that decode materials.
 */
export const MATERIALS = createDictionary(materialKeys)
