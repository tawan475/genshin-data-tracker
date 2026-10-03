<script setup lang="ts">
import UiSkeleton from '@/components/ui/UiSkeleton.vue'

/** The list's shape while it loads: a day header and a few rows. */
</script>

<template>
  <div aria-busy="true" aria-label="Loading snapshots">
    <div class="flex items-center gap-3 border-b border-border-subtle px-2 py-3 md:px-3">
      <UiSkeleton class="ml-3 size-5" />
      <UiSkeleton class="h-5 w-48" />
    </div>
    <div
      v-for="n in 8"
      :key="n"
      class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-subtle px-2 py-3 last:border-b-0 md:flex-nowrap md:px-3"
    >
      <UiSkeleton class="mx-3 size-5" />
      <div class="flex min-w-0 flex-1 flex-col gap-1.5">
        <UiSkeleton class="h-5 w-32" />
      </div>
      <div class="order-last flex basis-full gap-4 pl-14 md:order-none md:basis-auto md:pl-0">
        <UiSkeleton class="h-4 w-16" />
        <UiSkeleton class="h-4 w-20" />
        <UiSkeleton class="h-4 w-16" />
        <UiSkeleton class="h-4 w-16" />
      </div>
      <UiSkeleton class="h-8 w-20" />
    </div>
  </div>
</template>
