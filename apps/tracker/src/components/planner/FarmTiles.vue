<script setup lang="ts">
import type { PlannerData } from '@gdt/game-data'
import { daysFor, type FarmPlan, type ResinNow } from '@gdt/game-data/planner-estimate'
import type { ExpTotal, PlanTotals } from '@gdt/game-data/planner-math'
import { computed } from 'vue'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import { gameIcon, materialIcon } from '@/lib/assets'
import { formatCompact, formatNumber } from '@/lib/format'
import { formatSeconds } from './farm-format'
import { characterName } from './model'

/**
 * The Farm tab's headline: resin and days for domains, normal bosses and
 * ley lines (Seelie's headline), weekly bosses in weeks, then Mora, EXP and
 * ore, and the conversion currencies when the plan uses them.
 */
const props = defineProps<{
  planner: PlannerData
  totals: PlanTotals
  plan: FarmPlan
  resin: ResinNow | null
}>()

type Tone = 'warning' | 'success' | 'neutral'

interface Tile {
  key: string
  label: string
  icon: string
  name: string
  main: string
  tone: Tone
  sub: string
  title: string
}

const TONE: Record<Tone, string> = {
  warning: 'text-warning-text',
  success: 'text-success-text',
  neutral: 'text-text-primary',
}

const icon = (key: string) => {
  const m = props.planner.materialsByKey.get(key)
  return m ? gameIcon(m.icon) : materialIcon(key)
}

function countTile(
  key: string,
  label: string,
  iconSrc: string,
  name: string,
  missing: number,
  have: number,
  need: number,
  title: string,
): Tile {
  return {
    key,
    label,
    icon: iconSrc,
    name,
    main: missing > 0 ? formatCompact(missing) : '✓',
    tone: missing > 0 ? 'warning' : 'success',
    sub: `${formatCompact(have)}/${formatCompact(need)}`,
    title,
  }
}

function expTile(key: string, label: string, total: ExpTotal, kind: 'character' | 'weapon'): Tile {
  const items = props.planner.expItems[kind]
  const big = items[items.length - 1]!
  const mix = total.missingItems.map((i) => `${formatNumber(i.count)} ${i.material.name}`)
  const parts = [
    `${kind === 'character' ? 'Character' : 'Weapon'} EXP: need ${formatNumber(total.need)}`,
    `have ${formatNumber(total.have)}`,
    mix.length ? `missing ${mix.join(' + ')}` : 'covered',
  ]
  const forge = props.totals.forge
  if (kind === 'weapon' && forge && forge.count > 0) {
    parts.push(
      `forge ${formatNumber(forge.count)} ${forge.ore.name} (${formatNumber(forge.mora)} Mora, ${formatSeconds(forge.seconds)})`,
    )
  }
  return countTile(
    key,
    label,
    gameIcon(big.material.icon),
    big.material.name,
    Math.ceil(total.missing / big.exp),
    Math.floor(total.have / big.exp),
    Math.ceil(total.need / big.exp),
    parts.join(' · '),
  )
}

const tiles = computed<Tile[]>(() => {
  const t = props.totals
  const p = props.plan
  const list: Tile[] = []

  // Resin: domains, normal bosses and ley lines.
  const total = p.total
  const resinParts = [
    `${formatNumber(total.runs)} runs · ${formatNumber(total.resin)} resin (${formatNumber(total.condensed)} condensed) · ${formatNumber(total.days)} days`,
    'domains, normal bosses and ley lines',
  ]
  if (props.resin?.known && total.resin > 0) {
    resinParts.push(
      `${formatNumber(daysFor(total.resin, props.resin.total))} days with the resin held`,
    )
  }
  if (total.gems.runs > 0) {
    resinParts.push(
      `gems: ${formatNumber(total.gems.runs)} runs, ${formatNumber(total.gems.resin)} resin`,
    )
  }
  if (total.partial) resinParts.push('some sources have no drop rate')
  if (total.locked) resinParts.push(`${formatNumber(total.locked)} locked by AR/WL`)
  list.push({
    key: 'resin',
    label: 'Resin',
    icon: materialIcon('OriginalResin'),
    name: 'Original Resin',
    main: total.resin > 0 ? `~${formatCompact(total.resin)}${total.partial ? '+' : ''}` : '–',
    tone: 'neutral',
    sub: total.resin > 0 ? `${formatNumber(total.days)}d` : '',
    title: resinParts.join(' · '),
  })

  // Weekly bosses: one claim each a week.
  const w = p.weeklyTotal
  if (w.weeks > 0 || p.weekly.some((b) => b.missing > 0)) {
    list.push({
      key: 'weekly',
      label: 'Weekly',
      icon: icon(p.weekly[0]?.lines[0]?.material.key ?? ''),
      name: 'Weekly bosses',
      main: w.weeks > 0 ? `${formatNumber(w.weeks)}w${w.partial ? '+' : ''}` : '–',
      tone: 'neutral',
      sub: w.resin > 0 ? formatCompact(w.resin) : '',
      title: [
        `${formatNumber(w.runs)} claims over ${formatNumber(w.weeks)} weeks`,
        `${formatNumber(w.resin)} resin with the weekly discount (${formatNumber(w.resinMax)} without)`,
        `Dream Solvent: ~${formatNumber(w.solvent.need)} to convert, ~${formatNumber(w.solvent.income)} dropped, ${formatNumber(w.solvent.held)} left`,
        w.partial ? 'some bosses have no drop rate' : '',
      ]
        .filter(Boolean)
        .join(' · '),
    })
  }

  // Mora, with crafting, forging and what passives save.
  const saved = t.passives?.saved.map(
    (s) => `${characterName(s.character)} saves ${formatNumber(s.mora)}`,
  )
  list.push(
    countTile(
      'mora',
      'Mora',
      materialIcon('Mora'),
      props.planner.mora.name,
      t.mora.missing,
      t.mora.have,
      t.mora.need,
      [
        `Mora: need ${formatNumber(t.mora.need)}`,
        `crafting ${formatNumber(t.mora.crafting)}`,
        t.mora.forging ? `forging ${formatNumber(t.mora.forging)}` : '',
        ...(saved ?? []),
        `have ${formatNumber(t.mora.have)}`,
      ]
        .filter(Boolean)
        .join(' · '),
    ),
  )
  if (t.characterExp.need > 0)
    list.push(expTile('characterExp', 'EXP', t.characterExp, 'character'))
  if (t.weaponExp.need > 0) list.push(expTile('weaponExp', 'Ore', t.weaponExp, 'weapon'))

  // Conversion currencies the plan spends.
  const s = t.solvent
  if (s && (s.need > 0 || w.solvent.need > 0)) {
    list.push(
      countTile(
        'solvent',
        'Solvent',
        icon(s.key),
        props.planner.materialsByKey.get(s.key)?.name ?? 'Dream Solvent',
        s.missing,
        s.have,
        s.need,
        [
          `Dream Solvent: ${formatNumber(s.need)} for the conversions now`,
          `${formatNumber(s.have)} held, ${formatNumber(s.used)} used`,
          s.blocked ? `${formatNumber(s.blocked)} conversions need more` : '',
          w.solvent.need > 0
            ? `farming: ~${formatNumber(w.solvent.need)} more to convert, ~${formatNumber(w.solvent.income)} from the claims`
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
      ),
    )
  }
  const a = t.azoth
  if (a && a.need > 0) {
    list.push(
      countTile(
        'azoth',
        'Dust',
        icon(a.key),
        props.planner.materialsByKey.get(a.key)?.name ?? 'Dust of Azoth',
        a.missing,
        a.have,
        a.need,
        `Dust of Azoth: ${formatNumber(a.need)} for every useful gem conversion · ${formatNumber(a.have)} held, ${formatNumber(a.used)} used · ${formatNumber(a.conversions.length)} conversions`,
      ),
    )
  }
  return list
})
</script>

<template>
  <ul class="grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4 2xl:grid-cols-7" aria-label="Totals">
    <li
      v-for="tile in tiles"
      :key="tile.key"
      class="flex min-w-0 flex-col items-center gap-1 rounded-xl border border-border-default bg-surface-raised p-2.5 text-center shadow-sm sm:flex-row sm:gap-3 sm:p-3 sm:text-left"
      :title="tile.title"
    >
      <span class="size-9 shrink-0 text-xs sm:size-11">
        <MaterialIcon :src="tile.icon" :name="tile.name" />
      </span>
      <span class="flex w-full min-w-0 flex-1 flex-col">
        <span class="truncate text-xs text-text-muted">{{ tile.label }}</span>
        <span
          class="tabular truncate font-mono text-base leading-6 font-semibold sm:text-lg"
          :class="TONE[tile.tone]"
          >{{ tile.main }}</span
        >
        <span class="tabular truncate font-mono text-[0.6875rem] text-text-muted sm:text-xs">{{
          tile.sub || ' '
        }}</span>
      </span>
      <span class="sr-only">{{ tile.title }}</span>
    </li>
  </ul>
</template>
