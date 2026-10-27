/**
 * Cooking recipes against the capture's `gi_collections.recipes` (recipe id
 * -> proficiency, every unlocked recipe). Pure.
 */

export type RecipeState = 'locked' | 'unmastered' | 'mastered'
export type RecipeFilter = 'all' | RecipeState

export interface RecipeRow {
  id: number
  name: string
  icon: string
  rarity: number
  /** Proficiency that masters it (0 when the game data does not say). */
  max: number
  proficiency: number
  state: RecipeState
  /** Unlocked, but newer than the game data. */
  unknown: boolean
}

/**
 * Every recipe the game data lists, in its order, then unlocked ones it
 * lacks. Mastered = proficiency at the recipe's max.
 */
export function recipeRows(
  recipes: readonly { id: number; name: string; icon: string; rarity: number; max: number }[],
  unlocked: Readonly<Record<string, number>>,
): RecipeRow[] {
  const known = new Set(recipes.map((recipe) => recipe.id))
  const state = (proficiency: number | undefined, max: number): RecipeState =>
    proficiency === undefined ? 'locked' : max > 0 && proficiency >= max ? 'mastered' : 'unmastered'
  return [
    ...recipes.map((recipe) => {
      const proficiency = unlocked[String(recipe.id)]
      return {
        ...recipe,
        proficiency: proficiency ?? 0,
        state: state(proficiency, recipe.max),
        unknown: false,
      }
    }),
    ...Object.entries(unlocked)
      .filter(([id]) => !known.has(Number(id)))
      .map(([id, proficiency]) => ({
        id: Number(id),
        name: '',
        icon: '',
        rarity: 0,
        max: 0,
        proficiency,
        state: 'unmastered' as const,
        unknown: true,
      })),
  ]
}
