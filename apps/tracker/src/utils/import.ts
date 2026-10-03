import { formatGdtTimestamp } from './export'

export type ImportValidationState = 'empty' | 'valid' | 'invalid'

export type ImportPreview = {
  characters: number
  weapons: number
  artifacts: number
  timestamp: string | null
}

export function isValidImportPayload(data: unknown): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const obj = data as Record<string, unknown>
  return (
    Array.isArray(obj.characters) ||
    Array.isArray(obj.weapons) ||
    Array.isArray(obj.artifacts)
  )
}

export function isValidImportJson(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  try {
    return isValidImportPayload(JSON.parse(trimmed))
  } catch {
    return false
  }
}

export function getImportValidationState(text: string): ImportValidationState {
  const trimmed = text.trim()
  if (!trimmed) return 'empty'
  return isValidImportJson(trimmed) ? 'valid' : 'invalid'
}

export function getImportPreview(json: object): ImportPreview {
  const record = json as Record<string, unknown>
  return {
    characters: Array.isArray(record.characters) ? record.characters.length : 0,
    weapons: Array.isArray(record.weapons) ? record.weapons.length : 0,
    artifacts: Array.isArray(record.artifacts) ? record.artifacts.length : 0,
    timestamp: extractImportTimestamp(json),
  }
}

export function isFileTooLargeForImport(file: File, maxBytes: number): boolean {
  return file.size > maxBytes
}

export function extractImportTimestamp(json: object): string | null {
  const record = json as Record<string, unknown>
  if (record.timestamp == null) return null

  const ts = new Date(
    isNaN(Number(record.timestamp))
      ? String(record.timestamp)
      : Number(record.timestamp),
  )
  if (isNaN(ts.getTime())) return null

  const offset = ts.getTimezoneOffset() * 60000
  return new Date(ts.getTime() - offset).toISOString().slice(0, 19)
}

export function createImportFileFromText(text: string, filename?: string): File {
  const trimmed = text.trim()
  if (!isValidImportJson(trimmed)) {
    throw new Error('Invalid import JSON')
  }

  const name =
    filename ?? `paste-import-${formatGdtTimestamp(new Date())}.json`
  return new File([trimmed], name, { type: 'application/json' })
}
