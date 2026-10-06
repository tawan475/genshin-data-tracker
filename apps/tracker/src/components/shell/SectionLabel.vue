<script setup lang="ts">
/** `collapsed`: the icon-only sidebar keeps just the rule (the heading stays for screen readers). */
defineProps<{ label: string; collapsed?: boolean }>()
</script>

<template>
  <div class="nav-fade mb-2 flex items-center px-1" :class="collapsed ? 'gap-0' : 'gap-3'">
    <h3
      class="nav-fade overflow-hidden text-xs font-bold tracking-[0.15em] whitespace-nowrap text-text-muted uppercase"
      :class="collapsed ? 'max-w-0 opacity-0' : 'max-w-40'"
    >
      {{ label }}
    </h3>
    <div class="h-px flex-1 bg-border-default" />
  </div>
</template>
