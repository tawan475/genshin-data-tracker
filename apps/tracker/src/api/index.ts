/**
 * Typed wrappers for every /api endpoint. Shapes come from @gdt/shared, the
 * same module the Worker validates against.
 */

import type {
  AchievementMarksResponse,
  AccountCreatedResponse,
  AccountResponse,
  AccountSettingsPatch,
  AccountSettingsResponse,
  CatalogRow,
  GenshinServer,
  Good,
  ImportKeyResponse,
  ImportResponse,
  MeResponse,
  PlannerTargetsResponse,
  SnapshotResponse,
  UserSettingsPatch,
} from '@gdt/shared'
import type { plannerTargetsPatch } from '@gdt/shared'
import type { z } from 'zod'
import { request, requestJson } from './http'

export * from './http'

export interface AccountInput {
  name?: string | null
  uid?: string | null
  server?: GenshinServer | null
}

export const api = {
  // ------------------------------------------------------------------ auth
  login: (login: string, password: string) =>
    requestJson<MeResponse>('/api/auth/login', {
      method: 'POST',
      json: { login, password },
      noRefresh: true,
    }),
  register: (body: { username: string; email: string | null; password: string }) =>
    requestJson<MeResponse>('/api/auth/register', { method: 'POST', json: body, noRefresh: true }),
  logout: () => requestJson<void>('/api/auth/logout', { method: 'POST', noRefresh: true }),
  logoutAll: () => requestJson<void>('/api/auth/logout-all', { method: 'POST' }),
  me: () => requestJson<MeResponse>('/api/auth/me'),
  updateProfile: (body: { username?: string; email?: string | null }) =>
    requestJson<MeResponse>('/api/auth/profile', { method: 'PATCH', json: body }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    requestJson<void>('/api/auth/password', { method: 'POST', json: body }),
  updateUserSettings: (patch: UserSettingsPatch) =>
    requestJson<MeResponse>('/api/me/settings', { method: 'PATCH', json: patch }),
  /** The user's Irminsul key for all accounts; replaces any old one. */
  newUserImportKey: () => requestJson<ImportKeyResponse>('/api/me/import-key', { method: 'POST' }),
  revokeUserImportKey: () => requestJson<void>('/api/me/import-key', { method: 'DELETE' }),

  // -------------------------------------------------------------- accounts
  /**
   * The account list unless it still has ETag `etag` (null: unchanged, a 304
   * with no body). Never from the HTTP cache: the tag is what decides.
   */
  accountsSince: async (
    etag: string | null,
  ): Promise<{ list: AccountResponse[]; etag: string | null } | null> => {
    const response = await request('/api/accounts', {
      cache: 'no-store',
      headers: etag ? { 'if-none-match': etag } : undefined,
    })
    if (response.status === 304) return null
    return {
      list: (await response.json()) as AccountResponse[],
      etag: response.headers.get('etag'),
    }
  },
  account: (id: number) => requestJson<AccountResponse>(`/api/accounts/${id}`),
  /** The account, after quiet imports: also tells the live pages it moved. */
  announceAccount: (id: number) =>
    requestJson<AccountResponse>(`/api/accounts/${id}/announce`, { method: 'POST' }),
  createAccount: (input: AccountInput) =>
    requestJson<AccountCreatedResponse>('/api/accounts', { method: 'POST', json: input }),
  updateAccount: (id: number, input: AccountInput) =>
    requestJson<AccountResponse>(`/api/accounts/${id}`, { method: 'PATCH', json: input }),
  deleteAccount: (id: number) => requestJson<void>(`/api/accounts/${id}`, { method: 'DELETE' }),
  rotateImportKey: (id: number) =>
    requestJson<ImportKeyResponse>(`/api/accounts/${id}/import-key`, { method: 'POST' }),
  accountSettings: (id: number) =>
    requestJson<AccountSettingsResponse>(`/api/accounts/${id}/settings`),
  updateAccountSettings: (id: number, patch: AccountSettingsPatch) =>
    requestJson<AccountSettingsResponse>(`/api/accounts/${id}/settings`, {
      method: 'PATCH',
      json: patch,
    }),

  // -------------------------------------------------------------- progress
  /** Achievement ids marked done by hand (captured ones come from snapshots). */
  achievementMarks: (id: number) =>
    requestJson<AchievementMarksResponse>(`/api/accounts/${id}/achievement-marks`),
  /** `done` is applied before `undone`. Answers with the full list. */
  updateAchievementMarks: (id: number, body: { done?: number[]; undone?: number[] }) =>
    requestJson<AchievementMarksResponse>(`/api/accounts/${id}/achievement-marks`, {
      method: 'PATCH',
      json: body,
    }),
  plannerTargets: (id: number) =>
    requestJson<PlannerTargetsResponse>(`/api/accounts/${id}/planner-targets`),
  /** `remove` is applied before `upsert`. Answers with every goal. */
  updatePlannerTargets: (id: number, body: z.input<typeof plannerTargetsPatch>) =>
    requestJson<PlannerTargetsResponse>(`/api/accounts/${id}/planner-targets`, {
      method: 'PATCH',
      json: body,
    }),

  // ------------------------------------------------------------- snapshots
  /** Uploads one GOOD file. `gzip` sends it compressed (the server inflates). */
  importGood: (
    id: number,
    body: BodyInit,
    options: { gzip?: boolean; timestamp?: number; quiet?: boolean } = {},
  ) => {
    const query = options.timestamp ? `?timestamp=${options.timestamp}` : ''
    return requestJson<ImportResponse>(`/api/accounts/${id}/import${query}`, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        ...(options.gzip ? { 'content-encoding': 'gzip' } : {}),
        // A run of uploads tells the live pages once, at its end (`announce`).
        ...(options.quiet ? { 'x-gdt-live': 'quiet' } : {}),
      },
    })
  },
  snapshots: (id: number) => requestJson<SnapshotResponse[]>(`/api/accounts/${id}/snapshots`),
  deleteSnapshot: (id: number, snapshotId: number) =>
    requestJson<void>(`/api/accounts/${id}/snapshots/${snapshotId}`, { method: 'DELETE' }),
  deleteSnapshots: (id: number, ids: number[]) =>
    requestJson<{ deleted: number }>(`/api/accounts/${id}/snapshots/delete`, {
      method: 'POST',
      json: { ids },
    }),
  catalog: (id: number) => requestJson<CatalogRow[]>(`/api/accounts/${id}/catalog`),
  /** Binary GDT1 bundle; decode with readBundle from @gdt/shared. */
  bundle: async (id: number, options: { ids?: number[]; sections?: string[] } = {}) => {
    const query = new URLSearchParams()
    if (options.ids) query.set('ids', options.ids.join(','))
    if (options.sections) query.set('sections', options.sections.join(','))
    const qs = query.toString()
    const response = await request(`/api/accounts/${id}/bundle${qs ? `?${qs}` : ''}`)
    return response.arrayBuffer()
  },
  snapshotGood: (id: number, snapshotId: number) =>
    requestJson<Good>(`/api/accounts/${id}/snapshots/${snapshotId}/good`),
  latestGood: (id: number) => requestJson<Good>(`/api/accounts/${id}/latest/good`),
}
