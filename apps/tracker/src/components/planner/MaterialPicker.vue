<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, ChevronDown, Package, Search, X } from 'lucide-vue-next'
import MaterialIcon from '@/components/materials-page/MaterialIcon.vue'
import UiInput from '@/components/ui/UiInput.vue'
import UiPopover from '@/components/ui/UiPopover.vue'
import { gameIcon } from '@/lib/assets'
import { formatNumber } from '@/lib/format'
import { materialName } from '@/utils/materials'
import { fromTouch } from './item-popover'
import {
  optionName,
  searchMaterialGroups,
  type MaterialGroup,
  type MaterialOption,
} from './material-filter'
import { materialSoft } from './material-soft'

/**
 * The Goals toolbar's material: a select-like button that opens a search
 * over the materials the counted goals still need (material-filter.ts),
 * grouped by kind, each with how many goals use it. Picking one keeps the
 * goals that use it; picking it again, or Any, lets every material through.
 * Enter in the search picks the first match.
 */
const props = defineProps<{ groups: readonly MaterialGroup[]; selected: MaterialOption | null }>()
const emit = defineEmits<{ pick: [key: string | null] }>()

const open = ref(false)
const touch = ref(false)
const trigger = ref<HTMLButtonElement | null>(null)
const query = ref('')
watch(open, (value) => {
  if (value) query.value = ''
})

const shown = computed(() => searchMaterialGroups(props.groups, query.value, materialName))
const label = computed(() =>
  props.selected ? optionName(props.selected, materialName) : 'Material',
)
const nameOf = (option: MaterialOption) => optionName(option, materialName)
/** A family's or the EXP's members, for the tooltip. */
const membersOf = (option: MaterialOption) =>
  option.members.length > 1 ? option.members.map((m) => materialName(m.key)).join(' · ') : ''

function toggle(event: MouseEvent) {
  touch.value = fromTouch(event)
  open.value = !open.value
}

function pick(key: string | null) {
  open.value = false
  emit('pick', key !== null && key === props.selected?.key ? null : key)
}

function pickFirst() {
  const first = shown.value[0]?.choices[0]
  if (first) pick(first.option.key)
}
</script>

<template>
  <button
    ref="trigger"
    type="button"
    class="flex min-h-10 w-full items-center gap-2 rounded-md border bg-surface-raised py-1 pr-3 text-left text-sm shadow-sm transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
    :class="
      selected
        ? 'border-accent-text pl-1 text-accent-text'
        : 'border-border-strong pl-3 text-text-primary'
    "
    aria-haspopup="dialog"
    :aria-expanded="open"
    :aria-label="selected ? `Material: ${label}` : 'Material'"
    :title="selected ? membersOf(selected) || label : 'Goals using a material'"
    @click="toggle"
  >
    <span
      v-if="selected"
      class="size-8 shrink-0 overflow-hidden rounded text-[0.625rem]"
      :class="materialSoft(selected.face.key, selected.face.rarity)"
    >
      <MaterialIcon :src="gameIcon(selected.face.icon)" :name="label" />
    </span>
    <Package v-else class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
    <span class="min-w-0 flex-1 truncate">{{ label }}</span>
    <ChevronDown class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
  </button>

  <UiPopover :open="open" :anchor="trigger" label="Material" :focus="!touch" @close="open = false">
    <div class="sticky top-0 z-10 border-b border-border-subtle bg-surface-raised p-2">
      <label class="relative block">
        <span class="sr-only">Search materials</span>
        <Search
          class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <UiInput
          v-model="query"
          class="pl-9"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="Search"
          autofocus
          @keydown.enter.prevent="pickFirst"
        />
      </label>
    </div>

    <div class="flex flex-col pb-1.5">
      <button
        v-if="selected && !query"
        type="button"
        class="mx-1.5 mt-1.5 flex items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
        @click="pick(null)"
      >
        <span class="inline-flex size-9 shrink-0 items-center justify-center" aria-hidden="true">
          <X class="size-4" />
        </span>
        Any
      </button>
      <section v-for="g in shown" :key="g.id" :aria-label="g.label">
        <h3 class="px-4 pt-2.5 pb-1 text-xs font-semibold text-text-muted">{{ g.label }}</h3>
        <ul class="flex flex-col px-1.5">
          <li v-for="c in g.choices" :key="c.option.key">
            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface-overlay"
              :class="[
                selected?.key === c.option.key ? 'text-accent-text' : '',
                c.count === 0 && selected?.key !== c.option.key ? 'opacity-50' : '',
              ]"
              :aria-pressed="selected?.key === c.option.key"
              :title="membersOf(c.option) || undefined"
              @click="pick(c.option.key)"
            >
              <span
                class="size-9 shrink-0 overflow-hidden rounded-lg text-xs"
                :class="materialSoft(c.option.face.key, c.option.face.rarity)"
              >
                <MaterialIcon :src="gameIcon(c.option.face.icon)" :name="nameOf(c.option)" />
              </span>
              <span class="min-w-0 flex-1 truncate text-sm">{{ nameOf(c.option) }}</span>
              <span
                class="tabular font-mono text-sm"
                :class="selected?.key === c.option.key ? 'text-accent-text' : 'text-text-muted'"
                :title="`${formatNumber(c.count)} ${c.count === 1 ? 'goal' : 'goals'}`"
                >{{ formatNumber(c.count) }}</span
              >
              <Check
                v-if="selected?.key === c.option.key"
                class="size-4 shrink-0 text-accent-text"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
      </section>
      <p v-if="shown.length === 0" class="px-4 py-6 text-center text-sm text-text-secondary">
        No matches
      </p>
    </div>
  </UiPopover>
</template>
