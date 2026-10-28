<script setup lang="ts">
import { Play } from 'lucide-vue-next'
import UiBadge from '@/components/ui/UiBadge.vue'
import type { CharacterGuides } from '@/data/character-guides'
import { GUIDE_SITES, YOUTUBE_RED } from './guide-marks'

/**
 * The character detail's Guides, after the artifacts: a link chip per
 * guide site and, when videos are picked, a "Videos · N" chip that opens
 * the Guides dialog.
 */
defineProps<{ guides: CharacterGuides }>()
defineEmits<{ videos: [] }>()
</script>

<template>
  <section class="flex flex-col gap-2.5" aria-labelledby="detail-guides">
    <h3 id="detail-guides" class="text-sm font-semibold text-text-secondary">
      {{ $t('characters.guides.title') }}
    </h3>
    <div class="flex flex-wrap gap-2">
      <a
        v-for="site in guides.sites"
        :key="site.type"
        :href="site.url"
        target="_blank"
        rel="noopener noreferrer"
        class="chip"
      >
        <span class="mark" :style="{ background: GUIDE_SITES[site.type].color }">{{
          GUIDE_SITES[site.type].letter
        }}</span>
        {{ GUIDE_SITES[site.type].name }}
        <UiBadge>{{
          $t(`characters.guides.${site.found ? GUIDE_SITES[site.type].purpose : 'search'}`)
        }}</UiBadge>
      </a>
      <button
        v-if="guides.videos.length"
        type="button"
        class="chip text-accent-text"
        @click="$emit('videos')"
      >
        <span class="mark" :style="{ background: YOUTUBE_RED }"
          ><Play class="size-4 fill-current" aria-hidden="true"
        /></span>
        {{ $t('characters.guides.videosCount', { n: guides.videos.length }) }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 2.67rem;
  padding: 0.33rem 0.875rem 0.33rem 0.33rem;
  border: 1px solid var(--color-border-default);
  border-radius: 0.6rem;
  background: var(--color-surface-raised);
  font-size: 0.86rem;
  font-weight: 500;
  text-decoration: none;
  transition: border-color 0.15s;
}
.chip:not(.text-accent-text) {
  color: var(--color-text-primary);
}
.chip:hover,
.chip:focus-visible {
  border-color: var(--color-border-strong);
}
.mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 0.5rem;
  color: #fff;
  font-size: 0.83rem;
  font-weight: 700;
}
</style>
