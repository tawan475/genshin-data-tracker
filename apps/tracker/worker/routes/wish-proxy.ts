/**
 * `POST /api/wishes/fetch-page`: one page of the game's wish history API for
 * the website's "wish link" import (HoYoverse's API does not answer
 * browsers; paimon.moe proxies it the same way). Signed in, with the CSRF
 * header, 120 pages a minute per user.
 *
 * Not an open proxy: the request is rebuilt from the pasted link's
 * credential alone (@gdt/shared wishApiUrl): one of the two API hosts, the
 * one path, only the parameters the API needs. The authkey in it is a
 * password while it lasts: never stored, never logged (errors name no URL).
 * The API's answer goes back as it is ({retcode, message, data}).
 */

import { parseWishLink, wishApiUrl, UIGF_GACHA_TYPES } from '@gdt/shared'
import { Hono } from 'hono'
import { z } from 'zod'
import type { AppEnv } from '../env'
import { ApiError, parseJson, rateLimit } from '../lib/http'
import { requireUser } from '../lib/session'

const fetchPageRequest = z.object({
  url: z.string().min(1).max(16_384),
  gachaType: z
    .number()
    .int()
    .refine((n) => (UIGF_GACHA_TYPES as readonly number[]).includes(n), 'Not a banner type'),
  page: z.number().int().min(1).max(10_000),
  endId: z.string().regex(/^\d{1,19}$/),
})

/** How long the API may take. */
const UPSTREAM_TIMEOUT_MS = 10_000

export const wishProxy = new Hono<AppEnv>().post('/fetch-page', requireUser, async (c) => {
  const body = await parseJson(c, fetchPageRequest)
  const link = parseWishLink(body.url)
  if (!link) {
    throw new ApiError(400, 'invalid_link', 'Not a wish history link (it has no authkey)')
  }
  await rateLimit(c.env.WISH_PROXY_LIMITER, `wish-proxy:${c.get('userId')}`)
  const url = wishApiUrl(link, { gachaType: body.gachaType, page: body.page, endId: body.endId })
  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch (error) {
    // The error's text can carry the URL: log only its kind.
    console.warn('wish_proxy_failed', error instanceof Error ? error.name : 'unknown')
    throw new ApiError(502, 'upstream_unreachable', 'The wish history did not answer')
  }
  if (!response.ok) {
    console.warn('wish_proxy_status', response.status)
    throw new ApiError(502, 'upstream_status', `The wish history answered ${response.status}`)
  }
  let answer: unknown
  try {
    answer = await response.json()
  } catch {
    throw new ApiError(502, 'upstream_invalid', 'The wish history answered something else')
  }
  const shaped = answer as { retcode?: unknown; message?: unknown; data?: unknown }
  if (typeof shaped?.retcode !== 'number') {
    throw new ApiError(502, 'upstream_invalid', 'The wish history answered something else')
  }
  c.header('Cache-Control', 'no-store')
  return c.json({
    retcode: shaped.retcode,
    message: typeof shaped.message === 'string' ? shaped.message : '',
    data: shaped.data ?? null,
  })
})
