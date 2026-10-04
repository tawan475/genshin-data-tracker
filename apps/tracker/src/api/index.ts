/**
 * Typed wrappers for every /api endpoint. Shapes come from @gdt/shared, the
 * same module the Worker validates against.
 */

import type {
  AccountCreatedResponse,
  AccountResponse,
  AccountSettingsPatch,
  AccountSettingsResponse,
  CatalogRow,
  GenshinServer,
  Good,
  ImportResponse,
  MeResponse,
  SnapshotResponse,
  UserSettingsPatch,
} from '@gdt/shared'
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
  updateProfile: (body: { currentPassword: string; username?: string; email?: string | null }) =>
    requestJson<MeResponse>('/api/auth/profile', { method: 'PATCH', json: body }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    requestJson<void>('/api/auth/password', { method: 'POST', json: body }),
  updateUserSettings: (patch: UserSettingsPatch) =>
    requestJson<MeResponse>('/api/me/settings', { method: 'PATCH', json: patch }),

  // -------------------------------------------------------------- accounts
  accounts: () => requestJson<AccountResponse[]>('/api/accounts'),
  account: (id: number) => requestJson<AccountResponse>(`/api/accounts/${id}`),
  createAccount: (input: AccountInput) =>
    requestJson<AccountCreatedResponse>('/api/accounts', { method: 'POST', json: input }),
  updateAccount: (id: number, input: AccountInput) =>
    requestJson<AccountResponse>(`/api/accounts/${id}`, { method: 'PATCH', json: input }),
  deleteAccount: (id: number) => requestJson<void>(`/api/accounts/${id}`, { method: 'DELETE' }),
  rotateImportKey: (id: number) =>
    requestJson<{ importKey: string }>(`/api/accounts/${id}/import-key`, { method: 'POST' }),
  accountSettings: (id: number) =>
    requestJson<AccountSettingsResponse>(`/api/accounts/${id}/settings`),
  updateAccountSettings: (id: number, patch: AccountSettingsPatch) =>
    requestJson<AccountSettingsResponse>(`/api/accounts/${id}/settings`, {
      method: 'PATCH',
      json: patch,
    }),

  // ------------------------------------------------------------- snapshots
  /** Uploads one GOOD file. `gzip` sends it compressed (the server inflates). */
  importGood: (
    id: number,
    body: BodyInit,
    options: { gzip?: boolean; timestamp?: number } = {},
  ) => {
    const query = options.timestamp ? `?timestamp=${options.timestamp}` : ''
    return requestJson<ImportResponse>(`/api/accounts/${id}/import${query}`, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        ...(options.gzip ? { 'content-encoding': 'gzip' } : {}),
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
