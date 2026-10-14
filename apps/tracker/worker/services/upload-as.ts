/**
 * One upload for an owner who is already known and allowed: an import key's
 * (routes/public) or a signed-in irminsul's session (routes/irminsul). Both
 * answer the same: the import's response with the `account` it went to.
 *
 * An account owner uploads to that account; a user owner to the user's
 * account whose UID is the file's `gi_player.uid`, made on the first upload
 * of a new UID (422 `uid_required` for a file without one).
 */

import type { ImportResponse } from '@gdt/shared'
import type { Context } from 'hono'
import type { AppEnv } from '../env'
import { ApiError } from '../lib/http'
import { D1Meter } from '../lib/meter'
import { accountForUid, type KeyAccount, type UploadOwner } from './accounts'
import { importSnapshot, parseUpload, type ParsedUpload, type Upload } from './import'
import { notifyUser } from './live'
import { recordObservedEvents } from './observed-events'

export async function uploadAs(
  c: Context<AppEnv>,
  owner: UploadOwner,
  upload: Upload,
  /** `uidRequired`: what a file without a UID is told (how to fix it differs per caller). */
  text: { uidRequired: string },
): Promise<Response> {
  const meter = new D1Meter()
  let account: KeyAccount
  let userId: number
  let created = false
  let parsed: ParsedUpload | undefined
  if (owner.scope === 'account') {
    account = owner.account
    userId = owner.userId
  } else {
    userId = owner.user.id
    parsed = await parseUpload(upload.text)
    const uid = parsed.good.player?.uid
    if (uid === undefined) throw new ApiError(422, 'uid_required', text.uidRequired)
    ;({ account, created } = await accountForUid(
      c.env.DB,
      meter,
      owner.user.id,
      String(uid),
      owner.accounts,
    ))
  }
  const { response, dataVersion, listener, observedEvents } = await importSnapshot(
    c.env.DB,
    account,
    upload,
    meter,
    parsed,
  ).catch((error: unknown) => {
    // The account this upload made stays, whatever happened to the file.
    if (created) notifyUser(c, userId, { type: 'accounts' })
    throw error
  })
  meter.report(c)
  recordObservedEvents(c, account.uid, observedEvents)
  // Only when someone listens (read in the import's own batch). A new
  // account is in the list now even when its first file changed nothing.
  if (dataVersion !== null || created) {
    notifyUser(
      c,
      userId,
      { type: 'data', accountId: account.id, dataVersion, takenAt: response.takenAt },
      listener,
    )
  }
  return c.json<ImportResponse>(
    { ...response, account: { id: account.id, name: account.name, uid: account.uid, created } },
    response.status === 'created' ? 201 : 200,
  )
}
