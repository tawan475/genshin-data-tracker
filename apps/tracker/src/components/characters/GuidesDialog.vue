<script setup lang="ts">
import { ref } from 'vue'
import { ExternalLink, Link } from 'lucide-vue-next'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiModal from '@/components/ui/UiModal.vue'
import type { CharacterGuides } from '@/data/character-guides'
import { characterIcon } from '@/lib/assets'
import { GUIDE_SITES, YOUTUBE_LOGO, pageLabel } from './guide-marks'

/**
 * One character's guides (option C of the design, 2026-10-28): the written
 * guides (the three sites, then other links), then the videos picked for
 * them in `data/character-guides.ts` (no Videos part without any). Every
 * row opens in a new tab.
 */
defineProps<{
  open: boolean
  characterKey: string
  name: string
  guides: CharacterGuides
}>()
defineEmits<{ close: [] }>()

/** Thumbnails that failed: YouTube's logo stands in. */
const broken = ref(new Set<string>())
</script>

<template>
  <UiModal
    :open="open"
    :title="$t('characters.guides.title')"
    @close="$emit('close')"
    @keydown.stop
  >
    <template #heading>
      <span class="mr-auto flex min-w-0 flex-1 items-center gap-2.5">
        <img
          :src="characterIcon(characterKey)"
          alt=""
          class="size-8 shrink-0 rounded-full bg-surface-overlay object-cover"
        />
        <h2 class="shrink-0 text-lg font-semibold">{{ $t('characters.guides.title') }}</h2>
        <span class="min-w-0 truncate text-text-muted" :title="name">{{ name }}</span>
      </span>
    </template>

    <div class="flex flex-col gap-2.5">
      <h3 class="label">{{ $t('characters.guides.written') }}</h3>
      <ul class="flex flex-col gap-0.5">
        <li v-for="site in guides.sites" :key="site.type">
          <a :href="site.url" target="_blank" rel="noopener noreferrer" class="row">
            <img :src="GUIDE_SITES[site.type].logo" alt="" class="mark" />
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="flex min-w-0 items-center gap-2 font-semibold">
                {{ GUIDE_SITES[site.type].name }}
                <UiBadge v-if="!site.found">{{ $t('characters.guides.search') }}</UiBadge>
              </span>
              <span class="sub">{{ pageLabel(site.url) }}</span>
            </span>
            <ExternalLink class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          </a>
        </li>
        <li v-for="link in guides.links" :key="link.url">
          <a :href="link.url" target="_blank" rel="noopener noreferrer" class="row">
            <span class="mark link-mark"><Link class="size-5" aria-hidden="true" /></span>
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="truncate font-semibold">{{ link.title }}</span>
              <span class="sub">{{ pageLabel(link.url) }}</span>
            </span>
            <ExternalLink class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          </a>
        </li>
      </ul>

      <template v-if="guides.videos.length">
        <h3 class="label mt-1">{{ $t('characters.guides.videos') }}</h3>
        <ul class="flex flex-col gap-0.5">
          <li v-for="video in guides.videos" :key="video.url">
            <a :href="video.url" target="_blank" rel="noopener noreferrer" class="row">
              <span class="thumb">
                <img
                  v-if="!broken.has(video.id)"
                  :src="`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`"
                  alt=""
                  loading="lazy"
                  class="absolute inset-0 size-full object-cover"
                  @error="broken = new Set([...broken, video.id])"
                />
                <img v-else :src="YOUTUBE_LOGO" alt="" class="size-8" />
              </span>
              <span class="flex min-w-0 flex-1 flex-col gap-0.5">
                <span class="video-title" :title="video.title">{{ video.title || video.url }}</span>
                <span v-if="video.channel" class="sub">{{ video.channel }}</span>
              </span>
              <ExternalLink class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
            </a>
          </li>
        </ul>
      </template>
    </div>
  </UiModal>
</template>

<style scoped>
.label {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}
.row {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  min-width: 0;
  min-height: 3.33rem;
  margin: 0 -0.625rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.625rem;
  color: var(--color-text-primary);
  text-decoration: none;
}
.row:hover,
.row:focus-visible {
  background: color-mix(in srgb, var(--color-text-muted) 12%, transparent);
}
.mark {
  flex: none;
  width: 2.22rem;
  height: 2.22rem;
  object-fit: contain;
}
.link-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.625rem;
  background: var(--color-surface-overlay);
  color: var(--color-text-secondary);
}
.sub {
  overflow: hidden;
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.thumb {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 7.1rem;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 0.5rem;
  background: var(--color-surface-overlay);
}
.video-title {
  display: -webkit-box;
  overflow: hidden;
  font-size: 0.86rem;
  font-weight: 500;
  line-height: 1.3;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
@media (max-width: 640px) {
  .thumb {
    width: 5.8rem;
  }
}
</style>
