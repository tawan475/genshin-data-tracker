<script setup lang="ts">
import { computed, inject } from 'vue'
import BaseModal from './BaseModal.vue'
import BaseButton from './BaseButton.vue'
import type { QueuedImportFile } from '../composables/useImportFlow'
import { IMPORT_FLOW_KEY, type ImportFlowContext } from '../composables/useImportFlow'
import { getImportValidationState } from '../utils/import'

const props = defineProps<{
  accountName?: string
}>()

const flow = inject(IMPORT_FLOW_KEY) as ImportFlowContext

const show = computed({
  get: () => flow.showModal.value,
  set: (v) => { flow.showModal.value = v },
})

const pasteValidation = computed(() =>
  getImportValidationState(flow.pasteText.value),
)

const validationBadge = computed(() => {
  switch (pasteValidation.value) {
    case 'valid':
      return {
        text: 'Valid import JSON',
        class: 'text-emerald-600 dark:text-emerald-400',
      }
    case 'invalid':
      return { text: 'Invalid JSON', class: 'text-red-600 dark:text-red-400' }
    default:
      return { text: '', class: '' }
  }
})

function statusIcon(file: QueuedImportFile) {
  if (file.importStatus === 'success') return '✓'
  if (file.importStatus === 'error') return '✗'
  return ''
}

function statusClass(file: QueuedImportFile) {
  if (file.importStatus === 'success')
    return 'text-emerald-600 dark:text-emerald-400'
  if (file.importStatus === 'error') return 'text-red-600 dark:text-red-400'
  return ''
}

function onCancel() {
  flow.cancelImport()
}

function onFileInput(e: Event) {
  const target = e.target as HTMLInputElement
  if (target.files?.length) {
    Array.from(target.files).forEach((f) => flow.addFileToQueue(f))
    target.value = ''
  }
}

function onModalDrop(e: DragEvent) {
  e.preventDefault()
  flow.isDraggingModal.value = false
  const files = Array.from(e.dataTransfer?.files ?? []).filter(
    (f) => f.type === 'application/json' || f.name.endsWith('.json'),
  )
  files.forEach((f) => flow.addFileToQueue(f))
}
</script>

<template>
  <BaseModal
    v-model="show"
    title="Import Data"
    size="4xl"
    @update:model-value="(v) => !v && onCancel()"
  >
    <div class="flex flex-col max-h-[90vh]">
      <p
        v-if="accountName"
        class="px-6 pt-4 text-sm text-slate-500 dark:text-slate-400"
      >
        Importing to:
        <span class="font-medium text-slate-800 dark:text-slate-200">{{
          accountName
        }}</span>
      </p>

      <div class="p-6 overflow-y-auto flex-1">
        <div
          v-if="flow.importError.value"
          class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-sm rounded-md whitespace-pre-wrap"
        >
          {{ flow.importError.value }}
        </div>

        <div
          v-if="flow.isImporting.value"
          class="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
        >
          <div class="flex justify-between items-center mb-2">
            <span class="text-sm font-semibold text-blue-900 dark:text-blue-100"
              >Importing…</span
            >
            <span class="text-sm font-medium text-blue-700 dark:text-blue-300">
              {{ flow.batchProgress.value.processed }} /
              {{ flow.batchProgress.value.total }}
            </span>
          </div>
          <div
            class="w-full bg-blue-200 dark:bg-blue-900/50 rounded-full h-2.5 mb-2 overflow-hidden"
          >
            <div
              class="bg-blue-600 dark:bg-blue-500 h-2.5 rounded-full transition-all duration-300"
              :style="{
                width: `${
                  flow.batchProgress.value.total
                    ? (flow.batchProgress.value.processed /
                        flow.batchProgress.value.total) *
                      100
                    : 0
                }%`,
              }"
            />
          </div>
          <p
            v-if="flow.importProgress.value"
            class="text-xs text-blue-600 dark:text-blue-400 truncate"
            :title="flow.importProgress.value.filename"
          >
            Processing:
            <span class="font-medium">{{
              flow.importProgress.value.filename
            }}</span>
          </p>
        </div>

        <template v-if="!flow.isImporting.value && flow.step.value === 'add'">
          <div
            class="mb-4 p-6 border-2 border-dashed rounded-lg text-center transition-colors"
            :class="
              flow.isDraggingModal.value
                ? 'border-slate-400 bg-slate-50 dark:bg-slate-900/50'
                : 'border-slate-300 dark:border-slate-600'
            "
            @dragover.prevent="flow.isDraggingModal.value = true"
            @dragleave.prevent="flow.isDraggingModal.value = false"
            @drop="onModalDrop"
          >
            <p class="text-sm text-slate-600 dark:text-slate-400 mb-3">
              Drop JSON files here or
            </p>
            <label class="inline-block">
              <input
                type="file"
                accept=".json,application/json"
                multiple
                class="hidden"
                @change="onFileInput"
              />
              <span
                class="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                Choose JSON files
              </span>
            </label>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-3">
              {{ flow.queueCount.value }} / {{ flow.MAX_IMPORT_FILES }} files ·
              max {{ flow.MAX_IMPORT_FILE_SIZE_MB }}MB each
            </p>
          </div>

          <div class="mb-4">
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm font-medium text-slate-700 dark:text-slate-300"
                >Paste JSON</label
              >
              <span
                v-if="validationBadge.text"
                class="text-xs"
                :class="validationBadge.class"
              >
                {{ validationBadge.text }}
              </span>
            </div>
            <textarea
              v-model="flow.pasteText.value"
              rows="6"
              placeholder="Paste Genshin / GOOD export JSON here…"
              class="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 resize-y min-h-[6rem]"
            />
          </div>

          <p class="text-xs text-slate-500 dark:text-slate-400">
            Ctrl+V outside inputs opens this modal when valid JSON is detected.
          </p>
        </template>

        <div v-if="flow.queueCount.value > 0 && !flow.isImporting.value" class="mt-4">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <p class="text-sm text-slate-500 dark:text-slate-400">
              {{ flow.queueCount.value }} file(s) queued
              <span v-if="flow.step.value === 'review'">· sorted by timestamp</span>
            </p>
            <div class="flex gap-2">
              <BaseButton
                v-if="flow.step.value === 'review'"
                variant="outline"
                size="xs"
                @click="flow.goToAdd()"
              >
                Add more
              </BaseButton>
              <BaseButton
                variant="outline"
                size="xs"
                @click="flow.clearAllTimestamps()"
              >
                Clear timestamps
              </BaseButton>
              <BaseButton
                variant="danger-outline"
                size="xs"
                @click="flow.clearAllFiles()"
              >
                Clear all
              </BaseButton>
            </div>
          </div>

          <div
            class="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg max-h-64"
          >
            <table class="w-full text-sm">
              <thead
                class="bg-slate-50 dark:bg-slate-900/80 text-left text-xs text-slate-500 dark:text-slate-400 sticky top-0"
              >
                <tr>
                  <th class="p-2 w-8" />
                  <th class="p-2">File</th>
                  <th class="p-2 hidden sm:table-cell">Chars</th>
                  <th class="p-2 hidden sm:table-cell">Wpn</th>
                  <th class="p-2 hidden sm:table-cell">Art</th>
                  <th class="p-2">Timestamp</th>
                  <th class="p-2 w-16" />
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 dark:divide-slate-700">
                <tr
                  v-for="fileObj in flow.selectedFiles.value"
                  :key="fileObj.id"
                  class="hover:bg-slate-50 dark:hover:bg-slate-900/40"
                >
                  <td class="p-2 text-center" :class="statusClass(fileObj)">
                    {{ statusIcon(fileObj) }}
                  </td>
                  <td
                    class="p-2 max-w-[12rem] truncate"
                    :title="fileObj.file.name"
                  >
                    {{ fileObj.file.name }}
                  </td>
                  <td class="p-2 hidden sm:table-cell text-slate-600 dark:text-slate-400">
                    {{ fileObj.preview?.characters ?? '—' }}
                  </td>
                  <td class="p-2 hidden sm:table-cell text-slate-600 dark:text-slate-400">
                    {{ fileObj.preview?.weapons ?? '—' }}
                  </td>
                  <td class="p-2 hidden sm:table-cell text-slate-600 dark:text-slate-400">
                    {{ fileObj.preview?.artifacts ?? '—' }}
                  </td>
                  <td class="p-2">
                    <input
                      v-model="fileObj.timestamp"
                      type="datetime-local"
                      step="1"
                      class="w-full min-w-[10rem] px-2 py-1 border border-slate-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-800"
                    />
                  </td>
                  <td class="p-2">
                    <BaseButton
                      variant="danger-outline"
                      size="xs"
                      @click="flow.removeFile(fileObj.id)"
                    >
                      Remove
                    </BaseButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p
            v-for="fileObj in flow.selectedFiles.value.filter(
              (f) => f.importStatus === 'error',
            )"
            :key="'err-' + fileObj.id"
            class="text-xs text-red-600 dark:text-red-400 mt-1"
          >
            {{ fileObj.file.name }}: {{ fileObj.errorMessage }}
          </p>
        </div>
      </div>

      <div
        class="p-6 border-t border-slate-100 dark:border-slate-700 shrink-0 flex justify-end gap-3"
      >
        <BaseButton variant="outline" :disabled="flow.isImporting.value" @click="onCancel">
          Cancel
        </BaseButton>

        <template v-if="!flow.isImporting.value && flow.step.value === 'add'">
          <BaseButton
            v-if="flow.pasteText.value.trim()"
            variant="outline"
            :disabled="flow.atQueueLimit.value"
            @click="flow.addPasteToQueue()"
          >
            Add paste to queue
          </BaseButton>
          <BaseButton
            v-if="flow.queueCount.value > 1"
            variant="outline"
            @click="flow.goToReview()"
          >
            Review queue ({{ flow.queueCount.value }})
          </BaseButton>
          <BaseButton
            v-if="flow.queueCount.value <= 1"
            variant="primary"
            @click="flow.handleImportNow()"
          >
            Import now
          </BaseButton>
          <BaseButton v-else variant="primary" @click="flow.goToReview()">
            Review & import
          </BaseButton>
        </template>

        <template v-if="!flow.isImporting.value && flow.step.value === 'review'">
          <BaseButton variant="primary" @click="flow.confirmImport()">
            Import {{ flow.queueCount.value }} file(s)
          </BaseButton>
        </template>
      </div>
    </div>
  </BaseModal>
</template>
