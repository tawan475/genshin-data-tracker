<script setup lang="ts">
import { computed, provide } from 'vue'
import {
  CARD_STILL,
  CARD_THEMES,
  type CardOwner,
  type CardTheme,
} from '@/components/characters/share-card'
import type { ArtifactRow } from '@/data/artifacts'
import { characterBanner } from '@/lib/assets'
import { formatDate } from '@/lib/format'
import ArtifactCard from './ArtifactCard.vue'

/**
 * An artifact's share picture (the artifact dialog's PNG / Copy / Share):
 * the grid's card, 1.6× (640px wide), over the wearer's namecard blurred
 * into atmosphere as on the character card (the same palette, CARD_THEMES),
 * with the owner line and the date and site at the foot. Laid out at
 * ARTIFACT_SHARE_WIDTH × ARTIFACT_SHARE_HEIGHT CSS pixels and exported at
 * ARTIFACT_SHARE_SCALE (1080 × 930).
 */
const props = defineProps<{
  row: ArtifactRow
  theme: CardTheme
  owner: CardOwner
  takenAt: number | null
}>()

provide(CARD_STILL, true)

const ROOT = computed(() => ({ ...CARD_THEMES[props.theme], fontSize: '16px' }))
const banner = computed(() =>
  props.row.artifact.location ? characterBanner(props.row.artifact.location) : '',
)
const ownerLine = computed(() =>
  [
    props.owner.name,
    props.owner.uid ? `UID ${props.owner.uid}` : null,
    props.owner.ar ? `AR ${props.owner.ar}` : null,
  ].filter((part): part is string => !!part),
)
</script>

<template>
  <div
    :data-theme="theme"
    class="relative flex h-[620px] w-[720px] flex-col overflow-hidden bg-(--card-ground) font-sans text-(--card-text)"
    :style="ROOT"
  >
    <img
      v-if="banner"
      :src="banner"
      alt=""
      class="pointer-events-none absolute top-[-40px] left-[-60px] h-[700px] w-[840px] max-w-none object-cover [filter:var(--card-namecard-filter)]"
    />
    <div class="absolute inset-0 [background:var(--card-scrim)]" />
    <div class="absolute inset-0 [background:var(--card-vignette)]" />

    <div class="relative mx-[40px] mt-[36px] h-[480px] w-[640px]">
      <div class="w-[400px] origin-top-left scale-[1.6]">
        <ArtifactCard :row="row" />
      </div>
    </div>

    <div
      class="relative mx-[44px] mt-auto mb-[28px] flex flex-col gap-[2px] text-(--card-hero) [text-shadow:var(--card-hero-shadow)]"
    >
      <p v-if="ownerLine.length" class="flex min-w-0 items-center gap-[10px] text-[20px]">
        <template v-for="(part, index) in ownerLine" :key="index">
          <span v-if="index" class="opacity-60">·</span>
          <span class="truncate" :class="index === 0 && owner.name ? 'font-semibold' : ''">{{
            part
          }}</span>
        </template>
      </p>
      <p class="flex items-center gap-[10px] text-[15px] whitespace-nowrap opacity-80">
        <template v-if="takenAt">
          <span>{{ formatDate(takenAt) }}</span>
          <span class="opacity-60">·</span>
        </template>
        <span>genshin-tracker.475.dev</span>
      </p>
    </div>
  </div>
</template>
