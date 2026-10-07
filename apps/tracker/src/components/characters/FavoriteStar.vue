<script setup lang="ts">
import { Star } from 'lucide-vue-next'
import { useReadOnly } from '@/views/account/context'

/**
 * The favourite toggle: a star, the game's gold when on. Off, it shows on
 * hover or focus of its `group/fav` (the card, the row) and faintly on touch
 * screens, which have no hover; `always` shows it regardless (a header).
 * Its click stays its own, so the card or row under it does not open.
 */
defineProps<{ on: boolean; name: string; always?: boolean }>()
defineEmits<{ toggle: [] }>()
/** Not on staff Inspect pages: favourites are the owner's. */
const readOnly = useReadOnly()
</script>

<template>
  <button
    v-if="!readOnly"
    type="button"
    :aria-pressed="on"
    :aria-label="`Favorite ${name}`"
    :title="on ? 'Unfavorite' : 'Favorite'"
    class="inline-flex size-7 shrink-0 items-center justify-center rounded-full transition focus-visible:opacity-100"
    :class="[
      on ? '' : 'text-text-muted hover:text-text-primary',
      on || always
        ? 'opacity-100'
        : 'opacity-0 group-focus-within/fav:opacity-100 group-hover/fav:opacity-100 pointer-coarse:opacity-60',
    ]"
    @click.stop="$emit('toggle')"
  >
    <Star
      class="size-4"
      :class="on ? 'fill-game-star text-game-star-edge' : ''"
      :stroke-width="on ? 1.5 : 2"
      aria-hidden="true"
    />
  </button>
</template>
