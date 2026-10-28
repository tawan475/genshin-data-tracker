<script setup lang="ts">
import { ref } from 'vue'
import { ExternalLink, Link, Play } from 'lucide-vue-next'
import UiBadge from '@/components/ui/UiBadge.vue'
import UiModal from '@/components/ui/UiModal.vue'
import type { CharacterGuides } from '@/data/character-guides'
import { characterIcon } from '@/lib/assets'
import { GUIDE_SITES, YOUTUBE_RED, pageLabel } from './guide-marks'

/**
 * One character's guides (option C of the design, 2026-10-28): the written
 * guides (the three sites, then other links), then the videos picked for
 * them in `data/character-guides.ts`. Every row opens in a new tab.
 */
defineProps<{
  open: boolean
  characterKey: string
  name: string
  guides: CharacterGuides
}>()
defineEmits<{ close: [] }>()

/** Thumbnails that failed: the play mark stands in. */
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
            <span class="mark" :style="{ background: GUIDE_SITES[site.type].color }">{{
              GUIDE_SITES[site.type].letter
            }}</span>
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="flex min-w-0 items-center gap-2 font-semibold">
                {{ GUIDE_SITES[site.type].name }}
                <UiBadge>{{
                  $t(`characters.guides.${site.found ? GUIDE_SITES[site.type].purpose : 'search'}`)
                }}</UiBadge>
              </span>
              <span class="sub">{{ pageLabel(site.url) }}</span>
            </span>
            <ExternalLink class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          </a>
        </li>
        <li v-for="link in guides.links" :key="link.url">
          <a :href="link.url" target="_blank" rel="noopener noreferrer" class="row">
            <span class="mark bg-surface-overlay text-text-secondary"
              ><Link class="size-5" aria-hidden="true"
            /></span>
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="truncate font-semibold">{{ link.title }}</span>
              <span class="sub">{{ pageLabel(link.url) }}</span>
            </span>
            <ExternalLink class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          </a>
        </li>
      </ul>

      <h3 class="label mt-1">{{ $t('characters.guides.videos') }}</h3>
      <ul v-if="guides.videos.length" class="flex flex-col gap-0.5">
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
              <span v-else class="play" :style="{ background: YOUTUBE_RED }"
                ><Play class="size-3.5 fill-current" aria-hidden="true"
              /></span>
            </span>
            <span class="flex min-w-0 flex-1 flex-col gap-0.5">
              <span class="video-title" :title="video.title">{{ video.title || video.url }}</span>
              <span v-if="video.channel" class="sub">{{ video.channel }}</span>
            </span>
            <ExternalLink class="size-4 shrink-0 text-text-muted" aria-hidden="true" />
          </a>
        </li>
      </ul>
      <p v-else class="rounded-lg border border-dashed border-border-strong p-3.5 text-text-muted">
        {{ $t('characters.guides.noVideos') }}
      </p>
    </div>

    <template #footer>
      <p class="text-sm text-text-muted">{{ $t('characters.guides.picked') }}</p>
    </template>
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
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 2.22rem;
  height: 2.22rem;
  border-radius: 0.625rem;
  color: #fff;
  font-size: 0.95rem;
  font-weight: 700;
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
.play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.67rem;
  height: 1.17rem;
  border-radius: 0.33rem;
  color: #fff;
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
