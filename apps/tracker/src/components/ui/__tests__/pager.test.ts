import { describe, expect, it } from 'vitest'
import { pageFromInput, pagerItems } from '../pager'

describe('pagerItems', () => {
  it('keeps the ends and the current page with its neighbours', () => {
    expect(pagerItems(56, 1)).toEqual([1, 2, null, 56])
    expect(pagerItems(56, 20)).toEqual([1, null, 19, 20, 21, null, 56])
    expect(pagerItems(56, 56)).toEqual([1, null, 55, 56])
    expect(pagerItems(4, 2)).toEqual([1, 2, 3, 4])
  })
})

describe('pageFromInput', () => {
  it('takes a whole page number in range', () => {
    expect(pageFromInput('12', 56)).toBe(12)
    expect(pageFromInput(' 56 ', 56)).toBe(56)
    expect(pageFromInput('1,000', 2000)).toBe(1000)
  })

  it('refuses anything else', () => {
    for (const text of ['', '0', '57', '-3', '2.5', 'abc', '1e3']) {
      expect(pageFromInput(text, 56)).toBeNull()
    }
  })
})
