<script setup lang="ts">
/** The centred card the sign-in and sign-up forms sit in. */
defineProps<{ title: string; subtitle?: string }>()
</script>

<template>
  <div class="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
    <RouterLink
      :to="{ name: 'landing' }"
      class="mb-8 font-display text-3xl font-bold tracking-tight"
    >
      GI<span class="text-accent-text">/</span>tracker
    </RouterLink>
    <div
      class="w-full max-w-sm rounded-2xl border border-border-default bg-surface-raised p-6 shadow-card"
    >
      <h1 class="font-display text-2xl font-bold">{{ title }}</h1>
      <p v-if="subtitle" class="mt-1 text-text-secondary">{{ subtitle }}</p>
      <div class="mt-6">
        <slot />
      </div>
    </div>
    <div class="mt-6 text-text-secondary">
      <slot name="footer" />
    </div>
  </div>
</template>
