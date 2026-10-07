<script setup lang="ts">
import PublicFrame from '@/components/public/PublicFrame.vue'

/** The glass card the sign-in and sign-up forms sit in. */
defineProps<{ title: string }>()
</script>

<template>
  <PublicFrame>
    <div class="animate-fade-up relative z-10 flex flex-1 items-center justify-center p-6">
      <div class="glass-panel w-full max-w-md bg-slate-900/80 p-8 sm:p-10">
        <h1 class="mb-8 text-center text-3xl font-bold">{{ title }}</h1>
        <slot />
        <p v-if="$slots.footer" class="mt-6 text-center text-sm text-gray-400">
          <slot name="footer" />
        </p>
      </div>
    </div>
  </PublicFrame>
</template>

<style>
/* Shared by the auth forms: the original dark glass fields with the paimon focus glow. */
.glass-input {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid rgb(255 255 255 / 0.1);
  background: rgb(0 0 0 / 0.2);
  padding: 0.85rem 1rem;
  font-size: 1rem;
  color: white;
  transition: all 0.2s;
}
.glass-input:focus {
  outline: none;
  border-color: var(--paimon);
  background: rgb(0 0 0 / 0.3);
  box-shadow: 0 0 0 3px var(--paimon-glow);
}
.glass-input[aria-invalid='true'] {
  border-color: rgb(248 113 113 / 0.6);
}
</style>
