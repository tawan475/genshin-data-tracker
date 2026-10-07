import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  HUMAN_CHECK_FAILED,
  HUMAN_CHECK_RETRYING,
  QUIET_TIMEOUT_MS,
  createHumanCheckState,
  humanCheckPassed,
} from '../human-check-state'

function setup() {
  const restart = vi.fn()
  return { restart, state: createHumanCheckState(restart) }
}

describe('createHumanCheckState', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is not ready while loading, ready once a token comes', async () => {
    const { state } = setup()
    expect(state.ready.value).toBe(false)
    state.issued('t1')
    expect(state.ready.value).toBe(true)
    await expect(state.token()).resolves.toBe('t1')
  })

  it('is not ready after reset (a token works once) until the next token', () => {
    const { state, restart } = setup()
    state.issued('t1')
    state.reset()
    expect(state.ready.value).toBe(false)
    expect(restart).toHaveBeenCalledTimes(1)
    state.issued('t2')
    expect(state.ready.value).toBe(true)
  })

  it('is not ready once the token expires, nor while a challenge shows', () => {
    const { state } = setup()
    state.issued('t1')
    state.expired()
    expect(state.ready.value).toBe(false)

    state.challenge(true)
    expect(state.ready.value).toBe(false)
    state.challenge(false)
    expect(state.ready.value).toBe(false)
    state.issued('t2')
    expect(state.ready.value).toBe(true)
  })

  it('still gives a token when asked before it is ready: it waits for the next one', async () => {
    const { state } = setup()
    const pending = state.token()
    state.issued('t1')
    await expect(pending).resolves.toBe('t1')
  })

  it('waits for a person on a challenge past the quiet timeout', async () => {
    const { state } = setup()
    state.challenge(true)
    const pending = state.token()
    vi.advanceTimersByTime(QUIET_TIMEOUT_MS * 3)
    state.issued('t1')
    await expect(pending).resolves.toBe('t1')
  })

  it('fails a silent run that hangs', async () => {
    const { state } = setup()
    const pending = state.token()
    vi.advanceTimersByTime(QUIET_TIMEOUT_MS)
    await expect(pending).rejects.toThrow(HUMAN_CHECK_FAILED)
    expect(state.ready.value).toBe(false)
  })

  it('stays not ready when blocked, says so, and refuses tokens', async () => {
    const { state } = setup()
    const pending = state.token()
    state.blocked('Human check blocked.')
    await expect(pending).rejects.toThrow('Human check blocked.')
    expect(state.ready.value).toBe(false)
    expect(state.problem.value).toBe('Human check blocked.')
    await expect(state.token()).rejects.toThrow('Human check blocked.')
    state.reset()
    expect(state.problem.value).toBe('Human check blocked.')
  })

  it('shows a failed run until a token comes, and restarts it on the next token()', async () => {
    const { state, restart } = setup()
    const pending = state.token()
    state.errored()
    await expect(pending).rejects.toThrow(HUMAN_CHECK_FAILED)
    expect(state.ready.value).toBe(false)
    expect(state.problem.value).toBe(HUMAN_CHECK_RETRYING)

    const again = state.token()
    expect(restart).toHaveBeenCalledTimes(1)
    state.issued('t2')
    await expect(again).resolves.toBe('t2')
    expect(state.problem.value).toBeNull()
    expect(state.ready.value).toBe(true)
  })

  it('shows nothing when an unanswered challenge times out (it comes back)', () => {
    const { state } = setup()
    state.challenge(true)
    state.timedOut()
    expect(state.ready.value).toBe(false)
    expect(state.problem.value).toBeNull()
  })

  it('fails whoever waits when the form goes away', async () => {
    const { state } = setup()
    const pending = state.token()
    state.dispose()
    await expect(pending).rejects.toThrow(HUMAN_CHECK_FAILED)
  })
})

describe('humanCheckPassed', () => {
  it('passes at once when the check is off', () => {
    expect(humanCheckPassed(null, false)).toBe(true)
  })

  it('waits while the page has not asked the server yet', () => {
    expect(humanCheckPassed(undefined, false)).toBe(false)
    expect(humanCheckPassed(undefined, true)).toBe(false)
  })

  it('needs a token while the check is on', () => {
    expect(humanCheckPassed('site-key', false)).toBe(false)
    expect(humanCheckPassed('site-key', true)).toBe(true)
  })
})
