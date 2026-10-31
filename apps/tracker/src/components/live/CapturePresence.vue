<script setup lang="ts">
import type { CaptureCommandKind } from '@gdt/shared'
import { computed, onMounted, ref } from 'vue'
import { Camera, Sparkles } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import { t } from '@/i18n'
import { formatDateTime, formatRelative } from '@/lib/format'
import { loadPresence, presenceOf, sendCommand } from '@/live/presence'
import { useFeedback } from '@/stores/feedback'

/**
 * ● Playing now on PC-NAME · Sync wishes · Send a capture: Teyvat.me Capture
 * says the game runs for this account (docs/plans/capture-link.md). The
 * buttons ask that Capture to act at its next heartbeat (within a minute);
 * editors only. Hidden while nobody plays.
 */
const props = defineProps<{ accountId: number; now: number; canAct: boolean }>()
const feedback = useFeedback()
const sending = ref<CaptureCommandKind | null>(null)

onMounted(() => void loadPresence(props.accountId))

const state = computed(() => presenceOf(props.accountId, props.now))
const presence = computed(() => state.value?.presence ?? null)
const decoding = computed(() => presence.value?.state === 'decoding')
const title = computed(() =>
  presence.value
    ? [
        t('live.presence.seen', { time: formatDateTime(presence.value.at) }),
        presence.value.app ? `Teyvat.me Capture ${presence.value.app}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '',
)

async function ask(kind: CaptureCommandKind) {
  sending.value = kind
  try {
    await sendCommand(props.accountId, kind)
    feedback.toast({ tone: 'success', title: t(`live.presence.sent.${kind}`) })
  } catch (cause) {
    feedback.error(t('live.presence.notSent'), cause)
  } finally {
    sending.value = null
  }
}
</script>

<template>
  <div
    v-if="presence"
    class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-subtle bg-surface-raised px-4 py-2 text-sm"
    role="status"
  >
    <span
      class="inline-flex min-w-0 items-center gap-1.5 font-medium"
      :class="decoding ? 'text-success-text' : 'text-text-secondary'"
      :title="title"
    >
      <span class="relative flex size-2 shrink-0" aria-hidden="true">
        <span
          v-if="decoding"
          class="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60 motion-reduce:animate-none"
        />
        <span class="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      <span class="truncate">
        {{
          decoding
            ? $t('live.presence.playing', { device: presence.device })
            : $t('live.presence.running', { device: presence.device })
        }}
      </span>
    </span>
    <span class="text-text-muted">{{ formatRelative(presence.at, now) }}</span>
    <div v-if="canAct && decoding" class="ms-auto flex flex-wrap gap-2">
      <UiButton
        size="sm"
        :loading="sending === 'wishes'"
        :disabled="sending !== null || state!.pending.includes('wishes')"
        :title="$t('live.presence.wishesTitle')"
        @click="ask('wishes')"
      >
        <Sparkles class="size-4" aria-hidden="true" />
        {{
          state!.pending.includes('wishes')
            ? $t('live.presence.waiting')
            : $t('live.presence.wishes')
        }}
      </UiButton>
      <UiButton
        size="sm"
        :loading="sending === 'snapshot'"
        :disabled="sending !== null || state!.pending.includes('snapshot')"
        :title="$t('live.presence.snapshotTitle')"
        @click="ask('snapshot')"
      >
        <Camera class="size-4" aria-hidden="true" />
        {{
          state!.pending.includes('snapshot')
            ? $t('live.presence.waiting')
            : $t('live.presence.snapshot')
        }}
      </UiButton>
    </div>
  </div>
</template>
