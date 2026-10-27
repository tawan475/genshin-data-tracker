<script setup lang="ts">
import AppearanceButton from '@/components/shell/AppearanceButton.vue'
import { useSession } from '@/stores/session'

/**
 * The original public look: hero art under a dark gradient, glowing brand
 * mark. Always dark: routes using it carry `meta.public`, which paints the
 * whole document dark too (canvas, scrollbar, theme-color; lib/theme.ts).
 */
const session = useSession()
</script>

<template>
  <div
    class="relative isolate flex min-h-dvh flex-col overflow-hidden bg-public-ground text-gray-100"
    data-theme="dark"
  >
    <div class="absolute inset-0 -z-20 bg-[url('/hero-bg.webp')] bg-cover bg-center" />
    <div
      class="absolute inset-0 -z-10 bg-gradient-to-b from-public-ground/40 to-public-ground/95"
    />

    <nav class="animate-fade-up relative z-10 px-6 py-6 md:px-12">
      <div class="mx-auto flex max-w-7xl items-center justify-between">
        <RouterLink
          :to="{ name: 'landing' }"
          class="flex items-center gap-3 text-2xl font-bold tracking-tight text-white"
        >
          <span class="text-3xl text-paimon drop-shadow-[0_0_10px_var(--paimon-glow)]">✦</span>
          <span>Teyvat.me</span>
        </RouterLink>
        <div class="flex items-center gap-3">
          <AppearanceButton tone="public" />
          <RouterLink
            v-if="session.status === 'signed-in'"
            :to="{ name: 'home' }"
            class="rounded-full border border-white/10 px-6 py-2 font-semibold text-white transition hover:bg-white/10"
          >
            {{ $t('shell.public.dashboard') }}
          </RouterLink>
          <RouterLink
            v-else
            :to="{ name: 'login' }"
            class="rounded-full border border-white/10 px-6 py-2 font-semibold text-white transition hover:bg-white/10"
          >
            {{ $t('common.signIn') }}
          </RouterLink>
        </div>
      </div>
    </nav>

    <slot />
  </div>
</template>
