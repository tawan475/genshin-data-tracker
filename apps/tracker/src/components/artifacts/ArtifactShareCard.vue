<script setup lang="ts">
import { provide } from 'vue'
import { CARD_STILL, type CardTheme } from '@/components/characters/share-card'
import type { ArtifactRow } from '@/data/artifacts'
import ArtifactCard from './ArtifactCard.vue'

/**
 * An artifact's share picture (the artifact dialog's PNG / Copy / Share):
 * the grid's card alone, the wearer in its Equipped bar, on transparency,
 * ARTIFACT_SHARE_WIDTH CSS pixels wide (its height as laid out), exported
 * at ARTIFACT_SHARE_SCALE (1080 px wide). A 2px margin keeps its hairline.
 */
defineProps<{ row: ArtifactRow; theme: CardTheme }>()

provide(CARD_STILL, true)
</script>

<template>
  <div :data-theme="theme" class="w-[400px] p-[2px] font-sans" :style="{ fontSize: '16px' }">
    <ArtifactCard :row="row" still />
  </div>
</template>
