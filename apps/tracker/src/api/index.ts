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
  IdentitiesResponse,
  ImportKeyResponse,
  ImportResponse,
  MeResponse,
  OAuthLinkLoginResponse,
  OAuthPendingResponse,
  OAuthProvider,
  OAuthProvidersResponse,
  OAuthStartResponse,
  PlannerStateResponse,
  PlannerTargetsResponse,
  PlannerTasksResponse,
  ResetLinkResponse,
  SessionResponse,
  SnapshotResponse,
  UserSettingsPatch,
  VerifyEmailResponse,
} from '@gdt/shared'
import { staffApi } from './staff'
import type { plannerStatePatch, plannerTargetsPatch, plannerTasksPatch } from '@gdt/shared'
import type { z } from 'zod'
import { BUNDLE_FORMAT } from './format'
import { request, requestJson } from './http'

export { BUNDLE_FORMAT }
export * from './http'
export type { PurgeBody, StaffApi } from './staff'

export interface AccountInput {
  name?: string | null
  uid?: string | null
  server?: GenshinServer | null
}

export const api = {
  // ------------------------------------------------------------------ auth
  /** `turnstile`: the human check's token, while the server has it on. */
  login: (login: string, password: string, turnstile?: string) =>
    requestJson<MeResponse>('/api/auth/login', {
      method: 'POST',
      json: { login, password, turnstile },
      noRefresh: true,
    }),
  register: (body: {
    username: string
    email: string | null
    password: string
    turnstile?: string
  }) =>
    requestJson<MeResponse>('/api/auth/register', { method: 'POST', json: body, noRefresh: true }),
  logout: () => requestJson<void>('/api/auth/logout', { method: 'POST', noRefresh: true }),
  logoutAll: () => requestJson<void>('/api/auth/logout-all', { method: 'POST' }),
  me: () => requestJson<MeResponse>('/api/auth/me'),
  updateProfile: (body: { username?: string; email?: string | null }) =>
    requestJson<MeResponse>('/api/auth/profile', { method: 'PATCH', json: body }),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    requestJson<void>('/api/auth/password', { method: 'POST', json: body }),
  /** Mails a confirmation link for the signed-in user's email. */
  sendVerifyEmail: () => requestJson<void>('/api/auth/verify-email/send', { method: 'POST' }),
  verifyEmail: (token: string) =>
    requestJson<VerifyEmailResponse>('/api/auth/verify-email', {
      method: 'POST',
      json: { token },
      noRefresh: true,
    }),
  /** Always the same answer: whether a link went out is never told. */
  forgotPassword: (login: string) =>
    requestJson<unknown>('/api/auth/forgot-password', {
      method: 'POST',
      json: { login },
      noRefresh: true,
    }),
  checkResetLink: (token: string) =>
    requestJson<ResetLinkResponse>('/api/auth/reset-password/check', {
      method: 'POST',
      json: { token },
      noRefresh: true,
    }),
  /** Sets the password and signs this browser in. */
  resetPassword: (token: string, password: string) =>
    requestJson<MeResponse>('/api/auth/reset-password', {
      method: 'POST',
      json: { token, password },
      noRefresh: true,
    }),
  /** A first password, for an account made with Discord or Google. */
  setPassword: (password: string) =>
    requestJson<MeResponse>('/api/auth/password/set', { method: 'POST', json: { password } }),

  // ----------------------------------------------------- Discord / Google
  /** Which sign-in providers this server has (none until their secrets are set). */
  oauthProviders: () =>
    requestJson<OAuthProvidersResponse>('/api/auth/oauth/providers', { noRefresh: true }),
  /** Starts signing in at the provider: the URL to send the browser to. */
  oauthStart: (provider: OAuthProvider, next?: string) =>
    requestJson<OAuthStartResponse>(`/api/auth/oauth/${provider}/start`, {
      method: 'POST',
      json: next ? { next } : {},
      noRefresh: true,
    }),
  /** Starts linking the provider to the signed-in user. */
  oauthLink: (provider: OAuthProvider) =>
    requestJson<OAuthStartResponse>(`/api/auth/oauth/${provider}/link`, { method: 'POST' }),
  /** The provider account that signed in without a linked user (410 once it ran out). */
  oauthPending: () =>
    requestJson<OAuthPendingResponse>('/api/auth/oauth/pending', { noRefresh: true }),
  oauthCancel: () =>
    requestJson<void>('/api/auth/oauth/pending', { method: 'DELETE', noRefresh: true }),
  oauthRegister: (body: { username: string; useEmail: boolean; turnstile?: string }) =>
    requestJson<MeResponse>('/api/auth/oauth/pending/register', {
      method: 'POST',
      json: body,
      noRefresh: true,
    }),
  /** Signs in with a password and links the pending provider account. */
  oauthLinkLogin: (login: string, password: string, turnstile?: string) =>
    requestJson<OAuthLinkLoginResponse>('/api/auth/oauth/pending/login', {
      method: 'POST',
      json: { login, password, turnstile },
      noRefresh: true,
    }),
  identities: () => requestJson<IdentitiesResponse>('/api/auth/identities'),
  /** The signed-in devices, this one marked `current`. */
  sessions: () => requestJson<SessionResponse[]>('/api/auth/sessions', { cache: 'no-store' }),
  /** Signs one device out (this one's: a sign-out here). */
  revokeSession: (id: number) =>
    requestJson<void>(`/api/auth/sessions/${id}`, { method: 'DELETE' }),
  /** Signs every other device out; this one stays signed in. */
  revokeOtherSessions: () =>
    requestJson<void>('/api/auth/sessions/revoke-others', { method: 'POST' }),
  unlinkIdentity: (provider: OAuthProvider) =>
    requestJson<void>(`/api/auth/identities/${provider}`, { method: 'DELETE' }),

  updateUserSettings: (patch: UserSettingsPatch) =>
    requestJson<MeResponse>('/api/me/settings', { method: 'PATCH', json: patch }),
  /** Deletes the signed-in user and everything they own, once their username is typed. */
  deleteMe: (username: string) =>
    requestJson<void>('/api/auth/account', { method: 'DELETE', json: { username } }),
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
  /** Hand edits on top of the newest capture: material counts, goals' current state. */
  plannerState: (id: number) =>
    requestJson<PlannerStateResponse>(`/api/accounts/${id}/planner-state`),
  /** All or nothing; a 409 `capture_changed` when `base` is no longer the newest capture. */
  updatePlannerState: (id: number, body: z.input<typeof plannerStatePatch>) =>
    requestJson<PlannerStateResponse>(`/api/accounts/${id}/planner-state`, {
      method: 'PATCH',
      json: body,
    }),
  /** Built-in tasks' state and the player's own tasks. */
  plannerTasks: (id: number) =>
    requestJson<PlannerTasksResponse>(`/api/accounts/${id}/planner-tasks`),
  /** `remove` is applied before `upsert`; each task is written whole. Answers with every task. */
  updatePlannerTasks: (id: number, body: z.input<typeof plannerTasksPatch>) =>
    requestJson<PlannerTasksResponse>(`/api/accounts/${id}/planner-tasks`, {
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
  /** Binary GDT2 bundle; decode with decodeBundle / openBundle from @gdt/shared. */
  bundle: async (id: number, options: { ids?: number[]; sections?: string[] } = {}) => {
    const query = new URLSearchParams()
    if (options.ids) query.set('ids', options.ids.join(','))
    if (options.sections) query.set('sections', options.sections.join(','))
    query.set('format', String(BUNDLE_FORMAT))
    const qs = query.toString()
    const response = await request(`/api/accounts/${id}/bundle${qs ? `?${qs}` : ''}`)
    return response.arrayBuffer()
  },
  snapshotGood: (id: number, snapshotId: number) =>
    requestJson<Good>(`/api/accounts/${id}/snapshots/${snapshotId}/good`),
  latestGood: (id: number) => requestJson<Good>(`/api/accounts/${id}/latest/good`),

  /** The staff dashboard (/api/staff): only for users with the nodes. */
  staff: staffApi,
}
