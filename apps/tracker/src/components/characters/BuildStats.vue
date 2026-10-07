<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'
import ElementIcon from '@/components/ui/ElementIcon.vue'
import {
  formatPanelValue,
  type BuildPanel,
  type DamageKind,
  type StatRow,
} from '@/data/character-build'
import { ELEMENT_TEXT } from './tokens'

/**
 * The in-game Attributes screen (no team buffs), in its order, with the
 * DMG bonus the build carries in its element's colour. HP, ATK and DEF
 * split into base + bonus in the tooltip, like the game's white and green
 * numbers. `panel` null: the character is newer than the game data.
 */
const props = defineProps<{ panel: BuildPanel | null }>()

const CRIT = new Set(['critRate_', 'critDMG_'])
const DAMAGE_TEXT: Record<DamageKind, string> = { ...ELEMENT_TEXT, physical: 'text-physical' }

function title(row: StatRow): string {
  const lines = [`${row.label} ${row.text}`]
  if (row.base !== undefined && row.bonus !== undefined) {
    lines.push(`${formatPanelValue(row.key, row.base)} + ${formatPanelValue(row.key, row.bonus)}`)
  }
  if (row.damage && props.panel && props.panel.allDmg > 0) {
    lines.push(`+${props.panel.allDmg.toFixed(1)}% all DMG, not on the game's panel`)
  }
  return lines.join('\n')
}
</script>

<template>
  <section
    class="relative rounded-xl border border-border-default bg-surface-raised/85 px-3 py-1.5"
    aria-label="Stats"
  >
    <span
      v-if="panel?.weaponMissing"
      class="absolute -top-2 -right-2 inline-flex rounded-full bg-surface-raised p-1 text-warning-text shadow-sm"
      title="Weapon newer than the game data: its stats are left out"
    >
      <TriangleAlert class="size-4" aria-hidden="true" />
      <span class="sr-only">Weapon stats left out</span>
    </span>
    <dl v-if="panel" class="flex flex-col divide-y divide-border-subtle">
      <div
        v-for="row in panel.rows"
        :key="row.key"
        class="flex items-baseline justify-between gap-3 py-1.5"
        :title="title(row)"
      >
        <dt
          class="flex min-w-0 items-center gap-1.5 truncate text-sm"
          :class="
            row.damage
              ? DAMAGE_TEXT[row.damage]
              : CRIT.has(row.key)
                ? 'text-text-primary'
                : 'text-text-secondary'
          "
        >
          <ElementIcon
            v-if="row.damage && row.damage !== 'physical'"
            :element="row.damage"
            size="sm"
            decorative
            class="self-center"
          />
          {{ row.label }}
        </dt>
        <dd
          class="tabular shrink-0 font-mono"
          :class="[
            CRIT.has(row.key) ? 'font-semibold' : 'font-medium',
            row.damage ? DAMAGE_TEXT[row.damage] : '',
          ]"
        >
          {{ row.text }}
        </dd>
      </div>
    </dl>
    <p v-else class="py-6 text-center text-sm text-text-muted" title="Newer than the game data">
      No stats
    </p>
  </section>
</template>
