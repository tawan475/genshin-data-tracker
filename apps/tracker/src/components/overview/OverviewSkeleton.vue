<script setup lang="ts">
import UiSkeleton from '@/components/ui/UiSkeleton.vue'

/** Placeholders shaped like the history charts, monthly table and recent list. */
</script>

<template>
  <div class="flex flex-col gap-6" role="status">
    <span class="sr-only">Loading snapshot history</span>
    <section class="rounded-2xl border border-border-default bg-surface-raised">
      <div
        class="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4"
      >
        <div class="flex flex-col gap-2">
          <UiSkeleton class="h-6 w-28" />
          <UiSkeleton class="h-4 w-64 max-w-full" />
        </div>
        <UiSkeleton class="h-10 w-48" />
      </div>
      <div class="grid gap-8 p-5 lg:grid-cols-2">
        <div v-for="n in 4" :key="n" class="flex flex-col gap-3">
          <div class="flex justify-between gap-4">
            <UiSkeleton class="h-6 w-24" />
            <UiSkeleton class="h-6 w-32" />
          </div>
          <UiSkeleton class="h-56 w-full" />
        </div>
      </div>
    </section>

    <div class="grid gap-6 xl:grid-cols-3">
      <section class="rounded-2xl border border-border-default bg-surface-raised xl:col-span-2">
        <div class="border-b border-border-subtle px-5 py-4">
          <UiSkeleton class="h-6 w-44" />
        </div>
        <div class="flex flex-col gap-3 p-5">
          <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
            <UiSkeleton v-for="n in 4" :key="n" class="h-24" />
          </div>
          <UiSkeleton v-for="n in 6" :key="n" class="h-10 w-full" />
        </div>
      </section>
      <section class="rounded-2xl border border-border-default bg-surface-raised">
        <div class="border-b border-border-subtle px-5 py-4">
          <UiSkeleton class="h-6 w-40" />
        </div>
        <div class="flex flex-col gap-5 p-5">
          <div v-for="n in 5" :key="n" class="flex flex-col gap-2">
            <UiSkeleton class="h-5 w-48 max-w-full" />
            <UiSkeleton class="h-4 w-full" />
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
