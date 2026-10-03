import { ref, computed } from 'vue'
import type { InjectionKey } from 'vue'
import { useAuthStore } from '../stores/auth'
import { useGenshinStore } from '../stores/genshin'
import {
  consumeImportStream,
  parseImportFilenameTimestamp,
  type ImportProgressEvent,
} from '../utils/export'
import {
  createImportFileFromText,
  extractImportTimestamp,
  getImportPreview,
  isFileTooLargeForImport,
  isValidImportJson,
  type ImportPreview,
} from '../utils/import'
import {
  MAX_IMPORT_FILES,
  MAX_IMPORT_FILE_SIZE_BYTES,
  MAX_IMPORT_FILE_SIZE_MB,
} from '../constants/import'
import { swalError, swalSuccess } from '../utils/swal'

export type ImportFileStatus = 'pending' | 'success' | 'error'

export interface QueuedImportFile {
  id: number
  file: File
  timestamp: string
  preview: ImportPreview | null
  importStatus: ImportFileStatus
  errorMessage?: string
}

export type ImportStep = 'add' | 'review'

let fileIdCounter = 0

export type ImportFlowContext = ReturnType<typeof useImportFlow>
export const IMPORT_FLOW_KEY: InjectionKey<ImportFlowContext> = Symbol('importFlow')

export function useImportFlow() {
  const authStore = useAuthStore()
  const genshinStore = useGenshinStore()

  const showModal = ref(false)
  const step = ref<ImportStep>('add')
  const selectedFiles = ref<QueuedImportFile[]>([])
  const pasteText = ref('')
  const importProgress = ref<ImportProgressEvent | null>(null)
  const batchProgress = ref({ processed: 0, total: 0 })
  const isImporting = ref(false)
  const importError = ref('')
  const isDraggingModal = ref(false)

  const queueCount = computed(() => selectedFiles.value.length)
  const atQueueLimit = computed(() => queueCount.value >= MAX_IMPORT_FILES)
  const accountName = computed(() => genshinStore.selectedAccountName ?? '')

  function buildQueuedFile(
    file: File,
    jsonTimestamp?: string | null,
    preview?: ImportPreview | null,
  ): QueuedImportFile {
    const entry: QueuedImportFile = {
      id: fileIdCounter++,
      file,
      timestamp: '',
      preview: preview ?? null,
      importStatus: 'pending',
    }

    const filenameTimestamp = parseImportFilenameTimestamp(file.name)
    if (filenameTimestamp) {
      entry.timestamp = filenameTimestamp
    } else if (jsonTimestamp) {
      entry.timestamp = jsonTimestamp
    } else if (preview?.timestamp) {
      entry.timestamp = preview.timestamp
    }

    return entry
  }

  function sortQueueByTimestamp() {
    selectedFiles.value.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return ta - tb
    })
  }

  function openImportModal(options?: { prefillPaste?: string }) {
    if (!options?.prefillPaste) {
      selectedFiles.value = []
      pasteText.value = ''
      importError.value = ''
      importProgress.value = null
      batchProgress.value = { processed: 0, total: 0 }
      step.value = 'add'
    } else {
      pasteText.value = options.prefillPaste
      importError.value = ''
    }
    showModal.value = true
  }

  function canAddMore(count = 1): boolean {
    if (selectedFiles.value.length + count > MAX_IMPORT_FILES) {
      importError.value = `Maximum ${MAX_IMPORT_FILES} files per import batch.`
      return false
    }
    return true
  }

  function validateFileSize(file: File): boolean {
    if (isFileTooLargeForImport(file, MAX_IMPORT_FILE_SIZE_BYTES)) {
      importError.value = `File "${file.name}" exceeds ${MAX_IMPORT_FILE_SIZE_MB}MB limit.`
      return false
    }
    return true
  }

  function addFileToQueue(file: File, preview?: ImportPreview | null) {
    if (!canAddMore()) return false
    if (!validateFileSize(file)) return false

    const entry = buildQueuedFile(file, preview?.timestamp, preview)
    selectedFiles.value.push(entry)

    if (!entry.preview && !entry.timestamp) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string)
          const p = getImportPreview(json)
          entry.preview = p
          if (!entry.timestamp && p.timestamp) entry.timestamp = p.timestamp
        } catch {
          console.warn(`Could not parse JSON for ${file.name}`)
        }
      }
      reader.readAsText(file)
    }

    return true
  }

  function processFile(file: File) {
    if (file.type !== 'application/json' && !file.name.endsWith('.json')) {
      swalError('Invalid File', `File ${file.name} is not a valid JSON file.`)
      return
    }
    if (addFileToQueue(file)) {
      showModal.value = true
    }
  }

  function addPasteToQueue() {
    importError.value = ''
    const trimmed = pasteText.value.trim()
    if (!trimmed) return false

    if (!isValidImportJson(trimmed)) {
      importError.value =
        'Pasted content is not valid import JSON (expected characters, weapons, or artifacts arrays).'
      return false
    }

    if (!canAddMore()) return false

    try {
      const json = JSON.parse(trimmed)
      const preview = getImportPreview(json)
      const file = createImportFileFromText(trimmed)
      if (!validateFileSize(file)) return false
      selectedFiles.value.push(buildQueuedFile(file, preview.timestamp, preview))
      pasteText.value = ''
      return true
    } catch (err: unknown) {
      importError.value =
        err instanceof Error ? err.message : 'Failed to prepare pasted import'
      return false
    }
  }

  function goToReview() {
    sortQueueByTimestamp()
    step.value = 'review'
    importError.value = ''
  }

  function goToAdd() {
    step.value = 'add'
    importError.value = ''
  }

  function removeFile(id: number) {
    selectedFiles.value = selectedFiles.value.filter((f) => f.id !== id)
  }

  function clearAllFiles() {
    selectedFiles.value = []
    step.value = 'add'
  }

  function clearTimestamp(id: number) {
    const f = selectedFiles.value.find((f) => f.id === id)
    if (f) f.timestamp = ''
  }

  function clearAllTimestamps() {
    selectedFiles.value.forEach((f) => (f.timestamp = ''))
  }

  function cancelImport() {
    showModal.value = false
    selectedFiles.value = []
    pasteText.value = ''
    importError.value = ''
    importProgress.value = null
    batchProgress.value = { processed: 0, total: 0 }
    step.value = 'add'
    isImporting.value = false
  }

  function updateFileStatusFromProgress(event: ImportProgressEvent) {
    const file = selectedFiles.value.find((f) => f.file.name === event.filename)
    if (!file) return
    if (event.status === 'success') {
      file.importStatus = 'success'
      file.errorMessage = undefined
    } else if (event.status === 'error') {
      file.importStatus = 'error'
      file.errorMessage = event.message
    }
  }

  async function uploadBatch(batch: QueuedImportFile[]) {
    const formData = new FormData()
    const timestamps: (string | undefined)[] = []

    for (const importFile of batch) {
      formData.append('files', importFile.file)
      if (importFile.timestamp) {
        timestamps.push(new Date(importFile.timestamp).toISOString())
      } else {
        timestamps.push(undefined)
      }
    }

    formData.append('timestamps', JSON.stringify(timestamps))

    const res = await authStore.fetchWithAuth(
      `${authStore.API_URL}/genshin-accounts/${genshinStore.selectedAccountId}/import-bulk-stream`,
      { method: 'POST', body: formData },
    )

    if (!res.ok) {
      const errorText = await res.text()
      let message = 'Failed to import files'
      try {
        const data = JSON.parse(errorText)
        message = data.message || message
      } catch {
        if (errorText.trim()) message = errorText.trim()
      }
      throw new Error(message)
    }

    const offset = batchProgress.value.processed
    return consumeImportStream(res, (event) => {
      importProgress.value = event
      updateFileStatusFromProgress(event)
      batchProgress.value = {
        processed: offset + event.processed,
        total: batchProgress.value.total,
      }
    })
  }

  async function confirmImport() {
    if (selectedFiles.value.length === 0 || !genshinStore.selectedAccountId) return

    isImporting.value = true
    importError.value = ''
    importProgress.value = null

    const allFiles = [...selectedFiles.value]
    batchProgress.value = { processed: 0, total: allFiles.length }

    const chunks: QueuedImportFile[][] = []
    for (let i = 0; i < allFiles.length; i += MAX_IMPORT_FILES) {
      chunks.push(allFiles.slice(i, i + MAX_IMPORT_FILES))
    }

    const allResults: { filename: string; status: string; message?: string }[] = []

    try {
      for (const chunk of chunks) {
        const results = await uploadBatch(chunk)
        allResults.push(...results)
      }

      const successCount = allResults.filter((r) => r.status === 'success').length
      const errors = allResults.filter((r) => r.status === 'error')

      if (successCount > 0) {
        genshinStore.triggerRefetch()
      }

      if (errors.length === 0) {
        swalSuccess('Success', 'Import successful!')
        cancelImport()
      } else {
        selectedFiles.value = selectedFiles.value.filter((f) =>
          errors.some((e) => e.filename === f.file.name),
        )
        importError.value = errors
          .map((e) => `[${e.filename}]: ${e.message}`)
          .join('\n')
        importProgress.value = null
        step.value = 'review'
      }
    } catch (err: unknown) {
      importError.value = err instanceof Error ? err.message : 'Import failed'
      importProgress.value = null
    } finally {
      isImporting.value = false
    }
  }

  async function handleSubmitImport() {
    importError.value = ''

    if (pasteText.value.trim()) {
      if (!addPasteToQueue()) return
    }

    if (selectedFiles.value.length === 0) {
      importError.value = 'Add files or paste JSON to import.'
      return
    }

    if (selectedFiles.value.length === 1 && step.value === 'add') {
      await confirmImport()
      return
    }

    goToReview()
  }

  async function handleImportNow() {
    if (pasteText.value.trim() && !addPasteToQueue()) return
    if (selectedFiles.value.length === 0) {
      importError.value = 'Add files or paste JSON to import.'
      return
    }
    await confirmImport()
  }

  function handleGlobalPaste(e: ClipboardEvent) {
    if (!genshinStore.selectedAccountId || isImporting.value) return

    const target = e.target as HTMLElement
    if (
      target.closest(
        'input, textarea, [contenteditable="true"], [contenteditable=true]',
      )
    ) {
      return
    }

    const text = e.clipboardData?.getData('text')
    if (!text || !isValidImportJson(text)) return

    e.preventDefault()
    openImportModal({ prefillPaste: text })
  }

  return {
    showModal,
    step,
    selectedFiles,
    pasteText,
    importProgress,
    batchProgress,
    isImporting,
    importError,
    isDraggingModal,
    queueCount,
    atQueueLimit,
    accountName,
    MAX_IMPORT_FILES,
    MAX_IMPORT_FILE_SIZE_MB,
    openImportModal,
    processFile,
    addPasteToQueue,
    goToReview,
    goToAdd,
    removeFile,
    clearAllFiles,
    clearTimestamp,
    clearAllTimestamps,
    cancelImport,
    confirmImport,
    handleSubmitImport,
    handleImportNow,
    handleGlobalPaste,
    canAddMore,
    addFileToQueue,
    sortQueueByTimestamp,
  }
}
