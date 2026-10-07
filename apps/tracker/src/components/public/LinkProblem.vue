<script setup lang="ts">
import { computed } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { CircleAlert, MailWarning, TimerOff, Unlink } from 'lucide-vue-next'
import type { LinkProblem } from './link-problem'

/** A dead one-time link on a public page: what happened and the way to a new one. */
const props = defineProps<{ problem: LinkProblem; retry: RouteLocationRaw; retryLabel: string }>()

const icon = computed(
  () =>
    ({
      expired: TimerOff,
      used: Unlink,
      invalid: Unlink,
      email: MailWarning,
      other: CircleAlert,
    })[props.problem.kind],
)
</script>

<template>
  <div class="flex flex-col items-center gap-6 text-center" role="alert">
    <component :is="icon" class="size-10 text-paimon" aria-hidden="true" />
    <p class="text-gray-200">{{ problem.text }}</p>
    <RouterLink :to="retry" class="btn-glow w-full rounded-xl">{{ retryLabel }}</RouterLink>
  </div>
</template>
