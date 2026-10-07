import type { StaffUserRow } from '@gdt/shared'

const WEEK = 7 * 86_400_000

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning'

/** A user's one status badge: suspended, uploads blocked, or new (joined this week). */
export function userStatus(
  user: Pick<StaffUserRow, 'suspendedAt' | 'uploadsBlockedAt' | 'createdAt'>,
  now = Date.now(),
): { label: string; tone: BadgeTone } | null {
  if (user.suspendedAt !== null) return { label: 'Suspended', tone: 'danger' }
  if (user.uploadsBlockedAt !== null) return { label: 'Uploads blocked', tone: 'warning' }
  if (now - user.createdAt < WEEK) return { label: 'New', tone: 'accent' }
  return null
}

/** How an audit action reads in a sentence ("suspended", "inspected Main · Artifacts"). */
export function auditPhrase(action: string, detail: Record<string, unknown>): string {
  const text = (key: string) => (typeof detail[key] === 'string' ? (detail[key] as string) : '')
  switch (action) {
    case 'user.suspend':
      return 'suspended'
    case 'user.unsuspend':
      return 'lifted the suspension'
    case 'user.rename':
      return `renamed ${text('from')} → ${text('to')}`
    case 'user.reset_link':
      return 'made a reset link'
    case 'user.sessions':
      return detail.all ? 'signed out every device' : 'signed out a device'
    case 'user.unlink':
      return `unlinked ${text('provider')}`
    case 'user.delete':
      return 'deleted the user'
    case 'user.delete_self':
      return 'deleted their own user'
    case 'role.assign':
      return `gave ${text('role')}`
    case 'role.unassign':
      return `took ${text('role')}`
    case 'data.inspect':
      return `inspected ${[text('account'), text('view')].filter(Boolean).join(' · ')}`
    case 'data.block_uploads':
      return 'blocked uploads'
    case 'data.unblock_uploads':
      return 'unblocked uploads'
    case 'data.quota':
      return detail.bytes === null ? 'reset the storage quota' : 'set the storage quota'
    case 'data.reset_key':
      return text('account') ? `reset the key of ${text('account')}` : 'revoked the user key'
    case 'data.delete':
      return `deleted ${typeof detail.snapshots === 'number' ? detail.snapshots : ''} snapshots of ${text('account')}`
    case 'data.delete_account':
      return `deleted the account ${text('account')}`
    default:
      return action
  }
}
