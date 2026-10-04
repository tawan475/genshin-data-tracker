/**
 * What a build changed compared with the data/ already committed: the
 * append-only check (fails the build) and the human-readable summary printed
 * for review before committing.
 */

import type {
  AchievementsFile,
  AvatarsFile,
  GoalsFile,
  MaterialIndexFile,
  MetaFile,
  PlannerFile,
  TextFile,
} from '../../src/format.ts'
import type { KeysOverride } from './overrides.ts'
import type { Problems } from './problems.ts'

export interface DataSet {
  meta?: MetaFile
  achievements?: AchievementsFile
  goals?: GoalsFile
  text?: TextFile
  planner?: PlannerFile
  materials?: MaterialIndexFile
  avatars?: AvatarsFile
}

const missingFrom = <T>(before: Iterable<T>, after: Set<T>) =>
  [...before].filter((x) => !after.has(x))

/**
 * Ids and keys that were compiled before must still be there: stored
 * achievement marks and planner goals point at them. When the game really
 * removed one, list it under `removed` in overrides/keys.json.
 */
export function checkAppendOnly(
  previous: DataSet,
  next: DataSet,
  removed: KeysOverride['removed'],
  problems: Problems,
): void {
  const report = (
    what: string,
    gone: (string | number)[],
    section: keyof KeysOverride['removed'],
  ) => {
    if (gone.length === 0) return
    problems.error(
      `${gone.length} ${what} compiled before are gone: ${gone.slice(0, 20).join(', ')}${gone.length > 20 ? ', …' : ''}. ` +
        `If the game removed them, list them in overrides/keys.json removed.${section}.`,
    )
  }
  const ids = (rows?: { 0: number }[]) => (rows ?? []).map((r) => r[0])
  const keys = (rows?: { 0: string }[]) => (rows ?? []).map((r) => r[0])

  const achievements = new Set(ids(next.achievements?.rows))
  report(
    'achievement ids',
    missingFrom(ids(previous.achievements?.rows), achievements).filter(
      (id) => !removed.achievements.has(id),
    ),
    'achievements',
  )
  const goals = new Set(ids(next.goals?.rows))
  report(
    'achievement category ids',
    missingFrom(ids(previous.goals?.rows), goals).filter((id) => !removed.goals.has(id)),
    'goals',
  )
  const characters = new Set(keys(next.planner?.characters))
  report(
    'character keys',
    missingFrom(keys(previous.planner?.characters), characters).filter(
      (k) => !removed.characters.has(k),
    ),
    'characters',
  )
  const weapons = new Set(keys(next.planner?.weapons))
  report(
    'weapon keys',
    missingFrom(keys(previous.planner?.weapons), weapons).filter((k) => !removed.weapons.has(k)),
    'weapons',
  )
  const materials = new Set(ids(next.planner?.materials))
  const goneMaterials = missingFrom(ids(previous.planner?.materials), materials)
  if (goneMaterials.length > 0) {
    problems.warn(`Planner materials no longer used by any cost table: ${goneMaterials.join(', ')}`)
  }
}

function list(label: string, items: string[], limit = 25): string[] {
  if (items.length === 0) return []
  const shown = items.slice(0, limit).map((item) => `      ${item}`)
  if (items.length > limit) shown.push(`      … and ${items.length - limit} more`)
  return [`    ${label} (${items.length}):`, ...shown]
}

/** Lines describing what changed, for the terminal. */
export function describeChanges(previous: DataSet, next: DataSet): string[] {
  const lines: string[] = []
  const pm = previous.meta
  const nm = next.meta
  if (nm && (!pm || pm.sha !== nm.sha)) {
    lines.push(
      pm
        ? `  dump: ${pm.gameVersion} ${pm.sha.slice(0, 8)} -> ${nm.gameVersion} ${nm.sha.slice(0, 8)} (${nm.commitTitle})`
        : `  dump: ${nm.gameVersion} ${nm.sha.slice(0, 8)} (${nm.commitTitle}), first build`,
    )
  }

  // Achievements
  const title = (id: number) =>
    next.text?.achievements[id]?.[0] ?? previous.text?.achievements[id]?.[0] ?? '?'
  const before = new Map((previous.achievements?.rows ?? []).map((r) => [r[0], r]))
  const after = new Map((next.achievements?.rows ?? []).map((r) => [r[0], r]))
  const added = [...after.values()].filter((r) => !before.has(r[0]))
  const removedRows = [...before.values()].filter((r) => !after.has(r[0]))
  const changed = [...after.values()].filter((r) => {
    const old = before.get(r[0])
    return old && JSON.stringify(old) !== JSON.stringify(r)
  })
  const textChanged = [...after.keys()].filter((id) => {
    const a = previous.text?.achievements[id]
    const b = next.text?.achievements[id]
    return a && b && (a[0] !== b[0] || a[1] !== b[1])
  })
  const active = [...after.values()].filter((r) => !r[8])
  lines.push(
    `  achievements: ${active.length} active (${after.size} with disused), ` +
      `${active.reduce((sum, r) => sum + r[5], 0)} primogems`,
    ...list(
      'new',
      added.map(
        (r) => `${r[0]} ${title(r[0])} [${r[7] || 'no version'}${r[8] ? ', disused' : ''}]`,
      ),
    ),
    ...list(
      'removed',
      removedRows.map((r) => `${r[0]} ${title(r[0])}`),
    ),
    ...list(
      'changed',
      changed.map((r) => {
        const old = before.get(r[0])!
        const fields = next.achievements!.columns.filter(
          (_, i) => JSON.stringify(old[i]) !== JSON.stringify(r[i]),
        )
        return `${r[0]} ${title(r[0])}: ${fields
          .map((f) => {
            const i = next.achievements!.columns.indexOf(f)
            return `${f} ${JSON.stringify(old[i])} -> ${JSON.stringify(r[i])}`
          })
          .join(', ')}`
      }),
    ),
    ...list(
      'text changed',
      textChanged.map((id) => `${id} ${title(id)}`),
    ),
  )
  const goalsBefore = new Set((previous.goals?.rows ?? []).map((g) => g[0]))
  lines.push(
    ...list(
      'new categories',
      (next.goals?.rows ?? [])
        .filter((g) => !goalsBefore.has(g[0]))
        .map((g) => `${g[0]} ${next.text?.goals[g[0]] ?? '?'}`),
    ),
  )

  // Planner
  const p0 = previous.planner
  const p1 = next.planner
  if (p1) {
    /** Rows by key: new, removed, and changed (comparing what `content` says each row means). */
    const describe = <R extends [string, ...unknown[]]>(
      label: string,
      a: R[],
      b: R[],
      oldContent: (r: R) => string,
      newContent: (r: R) => string,
    ) => {
      const old = new Map(a.map((r) => [r[0], r]))
      const now = new Map(b.map((r) => [r[0], r]))
      return [
        ...list(
          `new ${label}`,
          [...now.keys()].filter((k) => !old.has(k)),
        ),
        ...list(
          `removed ${label}`,
          [...old.keys()].filter((k) => !now.has(k)),
        ),
        ...list(
          `${label} with changed data`,
          [...now.keys()].filter(
            (k) => old.has(k) && oldContent(old.get(k)!) !== newContent(now.get(k)!),
          ),
        ),
      ]
    }
    // Compare a row together with its tables' contents, so cost changes show
    // up even though table keys stay the same.
    const charContent = (planner?: PlannerFile) => (r: PlannerFile['characters'][number]) =>
      JSON.stringify([
        r.slice(1, 5),
        planner?.ascensions[r[5]],
        planner?.talents[r[6]],
        planner?.talents[r[7]],
        planner?.talents[r[8]],
      ])
    const weaponContent = (planner?: PlannerFile) => (r: PlannerFile['weapons'][number]) =>
      JSON.stringify([r.slice(1, 4), planner?.ascensions[r[4]]])
    lines.push(
      `  planner: ${p1.characters.length} characters, ${p1.weapons.length} weapons, ` +
        `${p1.materials.length} materials, ${p1.families.length} families, ` +
        `${p1.domains?.length ?? 0} domains, ${p1.weeklyBosses?.length ?? 0} weekly bosses`,
    )
    lines.push(
      ...describe(
        'characters',
        p0?.characters ?? [],
        p1.characters,
        charContent(p0),
        charContent(p1),
      ),
      ...describe('weapons', p0?.weapons ?? [], p1.weapons, weaponContent(p0), weaponContent(p1)),
    )
    const matsBefore = new Set((p0?.materials ?? []).map((m) => m[0]))
    lines.push(
      ...list(
        'new planner materials',
        p1.materials.filter((m) => !matsBefore.has(m[0])).map((m) => `${m[0]} ${m[2]} (${m[4]})`),
      ),
    )
    const famBefore = new Map((p0?.families ?? []).map((f) => [f[0], JSON.stringify(f)]))
    lines.push(
      ...list(
        'new material families',
        p1.families.filter((f) => !famBefore.has(f[0])).map((f) => `${f[0]} (${f[1]})`),
      ),
    )
    lines.push(
      ...list(
        'changed material families',
        p1.families
          .filter((f) => famBefore.has(f[0]) && famBefore.get(f[0]) !== JSON.stringify(f))
          .map((f) => f[0]),
      ),
    )
    // Planner v2 sections: domains and weekly bosses by their first family/material.
    const rowsBy = <R>(rows: R[] | undefined, id: (r: R) => string) =>
      new Map((rows ?? []).map((r) => [id(r), JSON.stringify(r)]))
    for (const [label, before, after] of [
      [
        'domains',
        rowsBy(p0?.domains, (d) => `${d[2] || d[0]} (${d[3].join(', ')})`),
        rowsBy(p1.domains, (d) => `${d[2] || d[0]} (${d[3].join(', ')})`),
      ],
      [
        'weekly bosses',
        rowsBy(p0?.weeklyBosses, (b) => `${b[2]} (${b[0].join(', ')})`),
        rowsBy(p1.weeklyBosses, (b) => `${b[2]} (${b[0].join(', ')})`),
      ],
    ] as const) {
      lines.push(
        ...list(
          `new ${label}`,
          [...after.keys()].filter((k) => !before.has(k)),
        ),
        ...list(
          `changed ${label}`,
          [...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k)),
        ),
      )
    }
    for (const key of [
      'characterExp',
      'weaponExp',
      'expItems',
      'moraPerExp',
      'levelCap',
      'promoteAR',
      'talentAscension',
      'unfarmable',
      'azoth',
      'forge',
      'resin',
      'passives',
    ] as const) {
      if (p0 && JSON.stringify(p0[key]) !== JSON.stringify(p1[key]))
        lines.push(`    ${key} changed`)
    }
  }

  // Material index
  const m0 = previous.materials?.materials ?? {}
  const m1 = next.materials?.materials ?? {}
  const newKeys = Object.keys(m1).filter((k) => !(k in m0))
  const movedKeys = Object.keys(m1).filter(
    (k) => k in m0 && JSON.stringify(m0[k]) !== JSON.stringify(m1[k]),
  )
  lines.push(`  material index: ${Object.keys(m1).length} keys`)
  lines.push(...list('new keys', newKeys))
  lines.push(...list('keys with a new item id or icon', movedKeys))
  return lines
}
