<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Plus } from 'lucide-vue-next'
import GameIcon from '@/components/ui/GameIcon.vue'
import { characterIcon, weaponIcon } from '@/lib/assets'
import { longPress, useGoalActions } from './goal-actions'
import { characterName, weaponName } from './model'

/**
 * Who needs something: goal ids (`character:Key`, `custom:<id>`,
 * `weapon:Key:Owner:<id>`, `item:Key`) as overlapping portraits, one per
 * character (a weapon goal shows its holder, a spare weapon itself, extra
 * item needs one "+" disc; a custom character its initials), "+N" past
 * `max`, which shows them all when tapped. On the Planner (goal-actions.ts)
 * each is a button: a tap opens the goal, a long press or right click
 * pauses it; favourites get a gold ring.
 */
const props = withDefaults(defineProps<{ goals: readonly string[]; max?: number }>(), { max: 6 })
const actions = useGoalActions()

interface Person {
  /** The first goal it stands for (what a tap opens). */
  id: string
  src: string
  name: string
  extra: boolean
  favorite: boolean
}

const people = computed<Person[]>(() => {
  const favorites = actions?.favorites.value
  const customs = actions?.names.value
  const nameOf = (key: string) => customs?.get(key) ?? characterName(key)
  const iconOf = (key: string) => (customs?.has(key) ? '' : characterIcon(key))
  const byKey = new Map<string, { id: string; src: string; names: string[]; who: string }>()
  for (const id of props.goals) {
    const [kind, key = '', owner = ''] = id.split(':')
    if (kind === 'item') {
      if (!byKey.has('extra')) byKey.set('extra', { id, src: '', names: ['Extra'], who: '' })
      continue
    }
    // A weapon goal shows the character holding it; a spare one, the weapon.
    const own = kind === 'character' || kind === 'custom'
    const who = own ? key : owner
    const name = own ? nameOf(key) : weaponName(key)
    const slot = who ? `c:${who}` : `w:${key}`
    const seen = byKey.get(slot)
    if (seen) {
      seen.names.push(name)
      // A character's own goal opens before its weapon's.
      if (own) seen.id = id
      continue
    }
    byKey.set(slot, {
      id,
      src: who ? iconOf(who) : weaponIcon(key, 2),
      names: who && !own ? [nameOf(who), name] : [name],
      who,
    })
  }
  return [...byKey.entries()].map(([slot, p]) => ({
    id: p.id,
    src: p.src,
    extra: slot === 'extra',
    favorite: !!p.who && !!favorites?.has(p.who),
    name: [...new Set(p.names)].join(' · '),
  }))
})
/** "+N" tapped: every portrait shows. */
const all = ref(false)
watch(
  () => props.goals,
  () => (all.value = false),
)
const shown = computed(() => (all.value ? people.value : people.value.slice(0, props.max)))
const extra = computed(() => people.value.length - shown.value.length)
const names = computed(() => people.value.map((p) => p.name).join(', '))
const rest = computed(() =>
  people.value
    .slice(props.max)
    .map((p) => p.name)
    .join(', '),
)
const hidden = computed(() => people.value.length - props.max)

/** One long-press tracker per goal shown. */
const presses = new Map<string, ReturnType<typeof longPress>>()
function press(id: string) {
  let p = presses.get(id)
  if (!p) {
    p = longPress(() => {
      navigator.vibrate?.(15)
      actions?.pause(id)
    })
    presses.set(id, p)
  }
  return p
}

function open(id: string) {
  actions?.open(id)
}
</script>

<template>
  <span
    v-if="people.length"
    class="inline-flex min-w-0 items-center"
    :class="all ? 'max-w-[70%] shrink! flex-wrap justify-end' : ''"
    :title="actions ? undefined : names"
  >
    <span v-if="!actions" class="sr-only">{{ names }}</span>
    <span
      class="flex -space-x-1.5"
      :class="all ? 'flex-wrap justify-end gap-y-1' : ''"
      :aria-hidden="actions ? undefined : 'true'"
    >
      <template v-for="p in shown" :key="p.id">
        <component
          :is="actions ? 'button' : 'span'"
          :type="actions ? 'button' : undefined"
          class="relative inline-flex shrink-0 rounded-full ring-2 select-none [-webkit-touch-callout:none]"
          :class="[
            p.favorite ? 'z-10 ring-rarity-5' : 'ring-surface-raised',
            actions
              ? 'touch-manipulation transition-transform hover:z-20 hover:scale-110 focus-visible:z-20'
              : '',
          ]"
          :aria-label="actions ? `${p.name}${p.favorite ? ' (favourite)' : ''}` : undefined"
          :title="actions ? `${p.name} · tap: open · hold or right-click: pause` : undefined"
          v-on="actions ? press(p.id).handlers : {}"
          @click="actions && open(p.id)"
        >
          <span
            v-if="p.extra"
            class="inline-flex size-7 items-center justify-center rounded-full bg-surface-overlay text-text-secondary"
          >
            <Plus class="size-4" aria-hidden="true" />
          </span>
          <GameIcon
            v-else
            :src="p.src"
            :name="p.name"
            size="xs"
            class="pointer-events-none rounded-full!"
          />
        </component>
      </template>
    </span>
    <button
      v-if="extra > 0"
      type="button"
      class="tabular ml-1 inline-flex min-h-7 items-center rounded-full px-1.5 font-mono text-xs text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
      :title="`${rest} · show all`"
      :aria-label="`${extra} more: ${rest}. Show all`"
      @click="all = true"
    >
      +{{ extra }}
    </button>
    <button
      v-else-if="all && hidden > 0"
      type="button"
      class="ml-1 inline-flex min-h-7 items-center rounded-full px-1.5 text-xs text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
      title="Show fewer"
      @click="all = false"
    >
      Less
    </button>
  </span>
</template>
