import { loadPlanner } from '@gdt/game-data'
import { loadDropRates } from '@gdt/game-data/drops'
import { createRequirementCache, planTotals, type PlanOptions } from '@gdt/game-data/planner-math'
import type { AccountResponse, Good } from '@gdt/shared'
import { computed, onBeforeUnmount, ref, watch, type ComputedRef } from 'vue'
import { NO_PLAYER } from '@/data/account-player'
import { loadAccountPlayer, loadLatestInventory } from '@/data/account-data'
import { usePlannerSettings } from '@/data/planner-settings'
import { useResource } from '@/data/use-resource'
import { loadGameIcons, loadMaterialIcons } from '@/lib/assets'
import { readStorage, writeStorage } from '@/lib/storage'
import { updatesHeld } from '@/live/holds'
import { onPlannerChange } from '@/live/planner-changes'
import { useAccounts } from '@/stores/accounts'
import { countChange, effectiveInventory, replacedAdjustments } from './hand-edits'
import { buildBoard, type RequirementCache } from './model'
import { usePlannerState } from './use-planner-state'
import { usePlannerTargets } from './use-planner-targets'

const NO_CAPTURE: Good = {
  format: 'GOOD',
  version: 3,
  source: '',
  characters: [],
  artifacts: [],
  weapons: [],
  materials: {},
}

/**
 * The planner's data for one account, shared by the Planner and the
 * Materials page (whose tiles open the same inventory editor): the newest
 * capture, the planner data and drop rates, the goals and the hand edits
 * (each with its optimistic store), the bag they make (capture + edits that
 * still apply), the settings and the totals against the bag.
 *
 * Goals and hand edits changed in another tab or device are re-read once
 * this tab is shown and nothing is open (data never changes under a dialog).
 */
export function usePlannerModel(account: ComputedRef<AccountResponse>) {
  const accounts = useAccounts()
  const accountId = computed(() => account.value.id)
  /** The capture hand edits are made against: the newest one's last sighting, 0 for none. */
  const base = computed(() => account.value.latest?.lastSeenAt ?? 0)

  const resource = useResource(
    () => account.value,
    async (a) => {
      const [inventory, planner, drops, player] = await Promise.all([
        a.latest ? loadLatestInventory(a) : Promise.resolve(null),
        loadPlanner(),
        // No rates means no estimates, not a broken page.
        loadDropRates().catch(() => null),
        // Nice to have: without it the settings (or the top bracket) decide.
        a.latest ? loadAccountPlayer(a).catch(() => NO_PLAYER) : Promise.resolve(NO_PLAYER),
        loadGameIcons(),
        loadMaterialIcons(),
      ])
      return { accountId: a.id, inventory, planner, drops, player }
    },
  )
  const data = computed(() => {
    const value = resource.data.value
    return value && value.accountId === account.value.id ? value : undefined
  })
  const planner = computed(() => data.value?.planner ?? null)
  /** The newest capture (an empty one when there is none). */
  const good = computed(() => (data.value ? (data.value.inventory?.good ?? NO_CAPTURE) : null))
  const drops = computed(() => data.value?.drops ?? null)
  const hasCapture = computed(() => !!data.value?.inventory)

  const store = usePlannerTargets(accountId)
  onBeforeUnmount(() => void store.flush())

  const state = usePlannerState(accountId, base, async (id) => {
    // The page's account is behind the server: bring it up to date now.
    await accounts.reload(id).catch(() => {})
    accounts.applyPending(true)
  })
  onBeforeUnmount(() => void state.flush())

  /** The bag the planner works with: the capture's counts and the hand edits that still apply. */
  const bag = computed(() => {
    const g = good.value
    const edits = state.adjustments.value
    return g && edits ? effectiveInventory(g.materials, edits, base.value) : null
  })
  /** The capture with the planner's bag, for the dialogs that read counts. */
  const goodView = computed<Good | null>(() =>
    good.value && bag.value ? { ...good.value, materials: bag.value } : null,
  )
  /** Edits a newer capture replaced (until the next write drops them). */
  const replaced = computed(() =>
    state.adjustments.value ? replacedAdjustments(state.adjustments.value, base.value).length : 0,
  )

  const { settings, save: saveSettings } = usePlannerSettings(accountId)
  /** What irminsul read at the newest login; an AR/WL setting wins over it. */
  const player = computed(() => data.value?.player ?? NO_PLAYER)
  const ar = computed(() => settings.value.ar ?? player.value.ar)
  const wl = computed(() => settings.value.wl ?? player.value.wl)

  /** Count the Mystic ore the chunks held can be forged into (this device's choice). */
  const forge = ref(readStorage('planner:forge') === '1')
  watch(forge, (value) => writeStorage('planner:forge', value ? '1' : '0'))

  /** Characters in the snapshot, for the Mora passives (Raiden Shogun, Wanderer). */
  const ownedCharacters = computed(() => new Set((good.value?.characters ?? []).map((c) => c.key)))
  const passiveOwners = computed(() =>
    settings.value.planner.passives ? ownedCharacters.value : null,
  )
  const planOptions = computed<PlanOptions>(() => ({
    azoth: settings.value.planner.azoth,
    passives: passiveOwners.value,
    forge: forge.value,
  }))

  // One per planner data (it never changes): each goal's cost is computed once per state.
  let cache: RequirementCache | null = null
  const requirementCache = computed(() =>
    planner.value ? (cache ??= createRequirementCache(planner.value)) : null,
  )
  const board = computed(() => {
    const p = planner.value
    const g = good.value
    const b = bag.value
    const targets = store.targets.value
    const overrides = state.overrides.value
    const c = requirementCache.value
    if (!p || !g || !b || !targets || !overrides || !c) return null
    return buildBoard(p, g, b, targets, c, overrides)
  })
  const totals = computed(() =>
    planner.value && bag.value && board.value
      ? planTotals(planner.value, board.value.goals, bag.value, planOptions.value)
      : null,
  )

  /** Sets a material's count (back to no edit when it is the capture's). */
  function setCount(key: string, value: number) {
    const capture = good.value?.materials[key] ?? 0
    state.change({ inventory: [countChange(key, value, capture)] })
  }

  /** Adds what was obtained to a material's count. */
  function addCount(key: string, count: number) {
    if (count !== 0) state.change({ inventory: [{ key, add: count }] })
  }

  // ------------------------------------------------------------- live

  let stale = false
  function catchUp() {
    if (!stale || updatesHeld.value || document.visibilityState !== 'visible') return
    stale = false
    void store.refresh()
    void state.refresh()
  }
  const stopListening = onPlannerChange((id) => {
    if (id !== accountId.value) return
    stale = true
    catchUp()
  })
  watch(updatesHeld, catchUp)
  document.addEventListener('visibilitychange', catchUp)
  onBeforeUnmount(() => {
    stopListening()
    document.removeEventListener('visibilitychange', catchUp)
  })

  return {
    accountId,
    base,
    resource,
    data,
    planner,
    good,
    drops,
    hasCapture,
    store,
    state,
    bag,
    goodView,
    replaced,
    settings,
    saveSettings,
    player,
    ar,
    wl,
    forge,
    passiveOwners,
    planOptions,
    requirementCache,
    board,
    totals,
    setCount,
    addCount,
  }
}
