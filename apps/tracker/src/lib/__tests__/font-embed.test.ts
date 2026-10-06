import { describe, expect, it } from 'vitest'
import { fontFaceRules, parseGoogleFontCss } from '@/lib/font-embed'

// The shape Google Fonts answers for a variable family with several weights.
const CSS = `
/* latin-ext */
@font-face {
  font-family: 'Outfit';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/outfit/v1/ext.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5;
}
/* latin */
@font-face {
  font-family: 'Outfit';
  font-style: normal;
  font-weight: 300;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/outfit/v1/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}
/* latin */
@font-face {
  font-family: 'Outfit';
  font-style: normal;
  font-weight: 800;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/outfit/v1/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}
/* vietnamese */
@font-face {
  font-family: 'Outfit';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/outfit/v1/vi.woff2) format('woff2');
}
`

describe('share image fonts', () => {
  it('reads every face of Google Fonts CSS', () => {
    const faces = parseGoogleFontCss(CSS)
    expect(faces.map((f) => [f.subset, f.weight])).toEqual([
      ['latin-ext', 300],
      ['latin', 300],
      ['latin', 800],
      ['vietnamese', 400],
    ])
    expect(faces[1]).toMatchObject({
      family: "'Outfit'",
      style: 'normal',
      url: 'https://fonts.gstatic.com/s/outfit/v1/latin.woff2',
      range: 'U+0000-00FF, U+0131',
    })
  })

  it('inlines one face per latin file, its weights as a range', () => {
    const rules = fontFaceRules(
      parseGoogleFontCss(CSS),
      new Map([
        ['https://fonts.gstatic.com/s/outfit/v1/latin.woff2', 'data:font/woff2;base64,AAA'],
        ['https://fonts.gstatic.com/s/outfit/v1/ext.woff2', 'data:font/woff2;base64,BBB'],
        ['https://fonts.gstatic.com/s/outfit/v1/vi.woff2', 'data:font/woff2;base64,CCC'],
      ]),
    )
    expect(rules.split('\n')).toEqual([
      "@font-face{font-family:'Outfit';font-style:normal;font-weight:300;src:url(data:font/woff2;base64,BBB) format('woff2');unicode-range:U+0100-02BA, U+02BD-02C5;}",
      "@font-face{font-family:'Outfit';font-style:normal;font-weight:300 800;src:url(data:font/woff2;base64,AAA) format('woff2');unicode-range:U+0000-00FF, U+0131;}",
    ])
  })

  it('leaves out files that could not be fetched', () => {
    expect(fontFaceRules(parseGoogleFontCss(CSS), new Map())).toBe('')
  })
})
