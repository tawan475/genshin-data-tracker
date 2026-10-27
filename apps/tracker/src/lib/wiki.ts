/**
 * Links to the Genshin Impact Fandom wiki, where a guide says where or how
 * something is found. Its page titles are the game's English names
 * (`Nefer: Reliable or Not`, `Radiant Spincrystal "A Letter from the Wind: II"`).
 */
const WIKI = 'https://genshin-impact.fandom.com/wiki/'

/** The wiki page titled `title` (spaces as underscores, `:` and `,` kept, the rest escaped). */
export function wikiPage(title: string): string {
  const path = encodeURIComponent(title.trim().replace(/ /g, '_'))
    .replace(/%3A/g, ':')
    .replace(/%2C/g, ',')
  return `${WIKI}${path}`
}
