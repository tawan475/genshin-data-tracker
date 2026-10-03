<script setup lang="ts">
import PublicFrame from '@/components/public/PublicFrame.vue'
import { useSession } from '@/stores/session'

const session = useSession()
</script>

<template>
  <PublicFrame>
    <main
      class="relative z-10 mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 items-center gap-16 px-6 py-12 md:px-12 lg:grid-cols-2"
    >
      <div class="animate-fade-up" style="animation-delay: 150ms">
        <span
          class="mb-6 inline-block rounded-full border border-blue-500/30 bg-blue-500/15 px-4 py-1.5 text-sm font-semibold text-blue-300"
        >
          Irminsul · GOOD
        </span>
        <h1 class="mb-6 text-5xl leading-tight font-bold tracking-tight md:text-7xl">
          Master your <br />
          <span class="text-gradient">Genshin journey</span>
        </h1>
        <p class="mb-10 max-w-md text-lg text-gray-400">
          Every login, snapshotted. Artifacts, materials, history.
        </p>
        <div class="mb-14 flex flex-col gap-4 sm:flex-row">
          <RouterLink v-if="session.status === 'signed-in'" :to="{ name: 'home' }" class="btn-glow">
            Open dashboard
          </RouterLink>
          <template v-else>
            <RouterLink :to="{ name: 'register' }" class="btn-glow">Get started</RouterLink>
            <RouterLink :to="{ name: 'login' }" class="btn-glass">Sign in</RouterLink>
          </template>
        </div>

        <div class="glass-panel inline-flex items-center gap-5 px-5 py-5 sm:gap-8 sm:px-8">
          <div class="flex flex-col gap-1">
            <span class="text-2xl font-bold text-white sm:text-3xl">~1 KB</span>
            <span class="text-xs font-semibold tracking-wider text-gray-400 uppercase"
              >Per snapshot</span
            >
          </div>
          <div class="h-10 w-px shrink-0 bg-white/10" />
          <div class="flex flex-col gap-1">
            <span class="text-2xl font-bold text-white sm:text-3xl">Auto</span>
            <span class="text-xs font-semibold tracking-wider text-gray-400 uppercase"
              >GOOD sync</span
            >
          </div>
          <div class="h-10 w-px shrink-0 bg-white/10" />
          <div class="flex flex-col gap-1">
            <span class="text-2xl font-bold text-white sm:text-3xl">Offline</span>
            <span class="text-xs font-semibold tracking-wider text-gray-400 uppercase"
              >Installable</span
            >
          </div>
        </div>
      </div>

      <div
        class="animate-fade-up relative h-[380px] lg:h-[480px]"
        style="animation-delay: 300ms"
        aria-hidden="true"
      >
        <div
          class="glass-panel animate-float absolute top-[8%] left-1/2 w-[280px] -translate-x-1/2 p-6 lg:left-[8%] lg:translate-x-0"
        >
          <div class="mb-5 flex items-center gap-4">
            <img
              src="https://enka.network/ui/UI_AvatarIcon_Furina.png"
              alt=""
              class="size-14 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 object-cover shadow-[0_0_15px_var(--paimon-glow)]"
            />
            <div>
              <p class="text-lg font-bold">Furina</p>
              <p class="text-sm text-gray-400">Lv 90 · C2</p>
            </div>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div class="h-full w-[85%] bg-paimon shadow-[0_0_10px_var(--paimon)]" />
          </div>
        </div>

        <div
          class="glass-panel animate-float-delayed absolute right-1/2 bottom-[8%] w-[240px] translate-x-1/2 p-6 lg:right-[8%] lg:translate-x-0"
        >
          <div class="mb-3 text-4xl text-paimon drop-shadow-[0_0_15px_rgba(245,158,11,0.6)]">✦</div>
          <p class="mb-1 text-2xl font-bold text-emerald-400">CV 42.0</p>
          <p class="font-medium text-gray-400">Crit DMG 21.8%</p>
        </div>
      </div>
    </main>
  </PublicFrame>
</template>
