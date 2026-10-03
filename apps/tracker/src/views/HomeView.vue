<script setup lang="ts">
import BaseButton from '../components/BaseButton.vue'
</script>

<template>
  <main class="flex-1 max-w-7xl mx-auto px-6 md:px-12 py-16 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
    <div class="opacity-0 animate-fade-up" style="animation-delay: 400ms;">
      <div class="inline-block px-4 py-1.5 bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded-full text-sm font-semibold mb-6">
        Version 1.0 Live
      </div>
      <h1 class="text-5xl md:text-7xl font-bold tracking-tight mb-6 leading-tight">
        Master Your <br />
        <span class="text-gradient">Genshin Journey</span>
      </h1>
      <p class="text-lg md:text-xl text-gray-400 mb-10 max-w-xl">
        Automatically export, track, and analyze your GOOD data. See your artifact progression, character builds, and material goals all in one elegant dashboard.
      </p>
      <div class="flex flex-col sm:flex-row gap-4 mb-16">
        <router-link to="/register" class="btn-primary">Get Started Free</router-link>
        <BaseButton variant="secondary" size="lg" class="!rounded-full px-8 font-semibold">View Demo</BaseButton>
      </div>
      
      <!-- Stats summary floating below -->
      <div class="glass-panel inline-flex items-center px-8 py-6 gap-8">
        <div class="flex flex-col gap-1">
          <span class="text-3xl font-bold text-white">3,240+</span>
          <span class="text-xs text-gray-400 uppercase tracking-wider font-semibold">Artifacts Scanned</span>
        </div>
        <div class="w-px h-10 bg-white/10"></div>
        <div class="flex flex-col gap-1">
          <span class="text-3xl font-bold text-white">Real-time</span>
          <span class="text-xs text-gray-400 uppercase tracking-wider font-semibold">GOOD Sync</span>
        </div>
        <div class="w-px h-10 bg-white/10"></div>
        <div class="flex flex-col gap-1">
          <span class="text-3xl font-bold text-white">Secure</span>
          <span class="text-xs text-gray-400 uppercase tracking-wider font-semibold">API Keys</span>
        </div>
      </div>
    </div>

    <!-- Hero Visuals (Floating Cards) -->
    <div class="relative h-[400px] lg:h-[500px] opacity-0 animate-fade-up" style="animation-delay: 600ms;">
      <div class="glass-panel absolute top-[10%] left-[50%] lg:left-[10%] -translate-x-1/2 lg:translate-x-0 w-[280px] p-6 animate-float">
        <div class="flex items-center gap-4 mb-5">
          <div class="w-14 h-14 rounded-full bg-gradient-to-br from-yellow-400 to-amber-600 shadow-[0_0_15px_var(--color-paimon-glow)]"></div>
          <div>
            <h4 class="text-lg font-bold">Paimon</h4>
            <span class="text-sm text-gray-400">Level 90/90</span>
          </div>
        </div>
        <div class="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div class="w-[85%] h-full bg-paimon shadow-[0_0_10px_var(--color-paimon)]"></div>
        </div>
      </div>
      
      <div class="glass-panel absolute bottom-[10%] right-[50%] lg:right-[10%] translate-x-1/2 lg:translate-x-0 w-[240px] p-6 animate-float-delayed">
        <div class="text-4xl text-paimon drop-shadow-[0_0_15px_rgba(245,158,11,0.6)] mb-3">✦</div>
        <div class="text-2xl font-bold text-emerald-400 mb-1">Crit DMG +32.6%</div>
        <div class="text-gray-400 font-medium">ATK +14.5%</div>
      </div>
    </div>
  </main>
</template>
