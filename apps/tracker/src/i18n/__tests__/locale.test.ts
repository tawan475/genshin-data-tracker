import { describe, expect, it } from 'vitest'
import { detectLocale, isLocale, LOCALES } from '../locale'

describe('detectLocale', () => {
  it('picks the first browser language the site has', () => {
    expect(detectLocale(['ja-JP', 'en-US'])).toBe('ja')
    expect(detectLocale(['ko'])).toBe('ko')
    expect(detectLocale(['pt-BR'])).toBe('pt')
    expect(detectLocale(['es-419', 'en'])).toBe('es')
    expect(detectLocale(['th-TH'])).toBe('th')
    expect(detectLocale(['de_DE'])).toBe('de')
    expect(detectLocale(['nl-NL', 'fr-FR'])).toBe('fr')
    expect(detectLocale(['en-GB', 'ru-RU'])).toBe('en')
  })

  it('tells Simplified from Traditional Chinese', () => {
    expect(detectLocale(['zh-CN'])).toBe('zh-CN')
    expect(detectLocale(['zh'])).toBe('zh-CN')
    expect(detectLocale(['zh-TW'])).toBe('zh-TW')
    expect(detectLocale(['zh-HK'])).toBe('zh-TW')
    expect(detectLocale(['zh-Hant-SG'])).toBe('zh-TW')
  })

  it("reads Indonesian's old code and falls back to English", () => {
    expect(detectLocale(['in-ID'])).toBe('id')
    expect(detectLocale(['nl', 'pl'])).toBe('en')
    expect(detectLocale([])).toBe('en')
  })

  it('knows every language the game ships, and no other', () => {
    expect(LOCALES).toHaveLength(15)
    for (const code of LOCALES) expect(isLocale(code)).toBe(true)
    for (const value of ['zh', 'jp', 'kr', 'EN', '', null]) expect(isLocale(value)).toBe(false)
  })
})
