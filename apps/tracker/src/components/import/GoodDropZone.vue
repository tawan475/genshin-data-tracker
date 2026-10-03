<script setup lang="ts">
import { MAX_IMPORT_FILES, MAX_IMPORT_FILE_SIZE_MB } from '@gdt/shared'
import { ref } from 'vue'
import { FileUp } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { collectDropped, collectFiles, type CollectedFiles } from '@/data/import-files'

/**
 * Where GOOD files come in: drag and drop (files or whole folders) or the
 * file picker. Emits the .json files and how many others were skipped.
 */
defineProps<{ primary?: boolean }>()
const emit = defineEmits<{ files: [collected: CollectedFiles] }>()

const input = ref<HTMLInputElement>()
const dragging = ref(false)
const collecting = ref(false)
let depth = 0

function carriesFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function onEnter(event: DragEvent) {
  if (!carriesFiles(event)) return
  depth++
  dragging.value = true
}

function onLeave(event: DragEvent) {
  if (!carriesFiles(event)) return
  depth = Math.max(0, depth - 1)
  if (depth === 0) dragging.value = false
}

async function onDrop(event: DragEvent) {
  depth = 0
  dragging.value = false
  if (!event.dataTransfer) return
  collecting.value = true
  try {
    emit('files', await collectDropped(event.dataTransfer))
  } finally {
    collecting.value = false
  }
}

function onPick(event: Event) {
  const target = event.target as HTMLInputElement
  const picked = Array.from(target.files ?? [])
  target.value = ''
  if (picked.length > 0) emit('files', collectFiles(picked))
}
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-5 py-8 text-center transition-colors"
    :class="
      dragging ? 'border-accent bg-surface-overlay' : 'border-border-strong bg-surface-raised'
    "
    :title="`Up to ${MAX_IMPORT_FILES} files, ${MAX_IMPORT_FILE_SIZE_MB} MB each. Folders work too.`"
    @dragenter.prevent="onEnter"
    @dragover.prevent
    @dragleave="onLeave"
    @drop.prevent="onDrop"
  >
    <UiSpinner v-if="collecting" class="size-8 text-text-muted" />
    <FileUp v-else class="size-8 text-text-muted" aria-hidden="true" />
    <h2 class="text-base font-semibold">Drop GOOD files</h2>
    <UiButton :variant="primary ? 'primary' : 'secondary'" @click="input?.click()">
      Browse
    </UiButton>
    <input
      ref="input"
      type="file"
      accept=".json,application/json"
      multiple
      class="hidden"
      tabindex="-1"
      aria-hidden="true"
      @change="onPick"
    />
  </div>
</template>
