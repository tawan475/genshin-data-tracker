import {
  parseObservedEvents,
  type AccountCreatedResponse,
  type DomainEventsResponse,
} from '@gdt/shared'
import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import { ORIGIN, irminsulForm, sampleExtras, sampleGood, signUp } from './client'

function importByKey(key: string, good: unknown, timestamp?: number) {
  return SELF.fetch(`${ORIGIN}/api/genshin-accounts-public/import-by-key`, {
    method: 'POST',
    headers: { 'x-import-key': key },
    body: irminsulForm(good, timestamp),
  })
}

/** The window is written in waitUntil: read until it shows (or give up). */
async function observedFor(server: keyof DomainEventsResponse['observed'], tries = 20) {
  for (let i = 0; i < tries; i++) {
    const body = (await (
      await SELF.fetch(`${ORIGIN}/api/domain-events`)
    ).json()) as DomainEventsResponse
    const windows = body.observed[server]
    if (windows?.length) return windows
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return []
}

describe('gi_events: the game schedule irminsul saw', () => {
  it('reads only known ids with a matching kind and sane times', () => {
    const begin = 1_792_872_000
    const week = 7 * 86_400
    expect(
      parseObservedEvents([
        { id: 601, kind: 'abundance', begin, end: begin + week, leftToday: 3 },
        { id: 601, kind: 'favor', begin, end: begin + week },
        { id: 999, kind: 'abundance', begin, end: begin + week },
        { id: 501, kind: 'favor', begin, end: begin + 60 },
        { id: 501, kind: 'favor', begin, end: begin + 50 * 86_400 },
        { id: 401, kind: 'mastery', begin: 'soon', end: begin },
        'nonsense',
      ]),
    ).toEqual([{ id: 601, kind: 'abundance', begin: begin * 1000, end: (begin + week) * 1000 }])
    expect(parseObservedEvents(undefined)).toEqual([])
  })

  it('a capture that carries them tells its whole server, in server time', async () => {
    const { client } = await signUp()
    const { importKey } = await client.json<AccountCreatedResponse>('/api/accounts', {
      method: 'POST',
      json: { name: 'Main', uid: '712345678', server: 'EUROPE' },
    })
    const now = Math.floor(Date.now() / 1000)
    // A run that started an hour ago (04:00 server time is not needed here).
    const begin = now - 3600
    const end = begin + 7 * 86_400 - 1
    const good = sampleGood({
      ...sampleExtras(),
      gi_events: [{ id: 601, kind: 'abundance', begin, end, scheduleId: 6010001, leftToday: 3 }],
    } as never)
    expect((await importByKey(importKey, good, 1_000)).status).toBe(201)

    const windows = await observedFor('EUROPE')
    const local = (s: number) => new Date(s * 1000 + 3_600_000).toISOString().slice(0, 16)
    expect(windows).toHaveLength(1)
    expect(windows[0]).toMatchObject({
      kind: 'abundance',
      start: local(begin),
      // 03:59:59-style ends round up to the minute (end-exclusive).
      end: local(Math.ceil(end / 60) * 60),
    })

    // The same window from another capture is counted, not duplicated.
    expect((await importByKey(importKey, good, 2_000)).status).toBe(200)
    expect(await observedFor('EUROPE')).toHaveLength(1)
  })
})
