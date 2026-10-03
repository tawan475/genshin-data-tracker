/**
 * Character rarity, element and weapon type, plus the artifact main stat and set tables the character pages need.
 *
 * GENERATED, do not edit by hand. Source: Genshin Optimizer's
 * libs/gi/stats/src/allStat_gen.json (https://github.com/frzyc/genshin-optimizer,
 * master @ 7348b03b8314, 2026-10-02). GOOD files carry none of this, so
 * keys released after that commit simply have no entry and the UI shows them
 * without rarity/element/type until this table is regenerated.
 */

export type Element = 'pyro' | 'hydro' | 'anemo' | 'electro' | 'dendro' | 'cryo' | 'geo'
export type WeaponType = 'sword' | 'claymore' | 'polearm' | 'bow' | 'catalyst'

/** [rarity, element (null: the Traveler changes element), weapon type] */
export const CHARACTER_META: Readonly<
  Record<string, readonly [number, Element | null, WeaponType]>
> = {
  Aino: [4, 'hydro', 'claymore'],
  Albedo: [5, 'geo', 'sword'],
  Alhaitham: [5, 'dendro', 'sword'],
  Aloy: [5, 'cryo', 'bow'],
  Alyosha: [4, 'electro', 'polearm'],
  Amber: [4, 'pyro', 'bow'],
  AratakiItto: [5, 'geo', 'claymore'],
  Arlecchino: [5, 'pyro', 'polearm'],
  Baizhu: [5, 'dendro', 'catalyst'],
  Barbara: [4, 'hydro', 'catalyst'],
  Beidou: [4, 'electro', 'claymore'],
  Bennett: [4, 'pyro', 'sword'],
  Candace: [4, 'hydro', 'polearm'],
  Charlotte: [4, 'cryo', 'catalyst'],
  Chasca: [5, 'anemo', 'bow'],
  Chevreuse: [4, 'pyro', 'polearm'],
  Chiori: [5, 'geo', 'sword'],
  Chongyun: [4, 'cryo', 'claymore'],
  Citlali: [5, 'cryo', 'catalyst'],
  Clorinde: [5, 'electro', 'sword'],
  Collei: [4, 'dendro', 'bow'],
  Columbina: [5, 'hydro', 'catalyst'],
  Cyno: [5, 'electro', 'polearm'],
  Dahlia: [4, 'hydro', 'sword'],
  Dehya: [5, 'pyro', 'claymore'],
  Diluc: [5, 'pyro', 'claymore'],
  Diona: [4, 'cryo', 'bow'],
  Dori: [4, 'electro', 'claymore'],
  Durin: [5, 'pyro', 'sword'],
  Emilie: [5, 'dendro', 'polearm'],
  Escoffier: [5, 'cryo', 'polearm'],
  Eula: [5, 'cryo', 'claymore'],
  Faruzan: [4, 'anemo', 'bow'],
  Fischl: [4, 'electro', 'bow'],
  Flins: [5, 'electro', 'polearm'],
  Freminet: [4, 'cryo', 'claymore'],
  Furina: [5, 'hydro', 'sword'],
  Gaming: [4, 'pyro', 'claymore'],
  Ganyu: [5, 'cryo', 'bow'],
  Gorou: [4, 'geo', 'bow'],
  HuTao: [5, 'pyro', 'polearm'],
  Iansan: [4, 'electro', 'polearm'],
  Ifa: [4, 'anemo', 'catalyst'],
  Illuga: [4, 'geo', 'polearm'],
  Ineffa: [5, 'electro', 'polearm'],
  Jahoda: [4, 'anemo', 'bow'],
  Jean: [5, 'anemo', 'sword'],
  Kachina: [4, 'geo', 'polearm'],
  KaedeharaKazuha: [5, 'anemo', 'sword'],
  Kaeya: [4, 'cryo', 'sword'],
  KamisatoAyaka: [5, 'cryo', 'sword'],
  KamisatoAyato: [5, 'hydro', 'sword'],
  Kaveh: [4, 'dendro', 'claymore'],
  Keqing: [5, 'electro', 'sword'],
  Kinich: [5, 'dendro', 'claymore'],
  Kirara: [4, 'dendro', 'sword'],
  Klee: [5, 'pyro', 'catalyst'],
  KujouSara: [4, 'electro', 'bow'],
  KukiShinobu: [4, 'electro', 'sword'],
  LanYan: [4, 'anemo', 'catalyst'],
  Lauma: [5, 'dendro', 'catalyst'],
  Layla: [4, 'cryo', 'sword'],
  Linnea: [5, 'geo', 'bow'],
  Lisa: [4, 'electro', 'catalyst'],
  Lohen: [5, 'cryo', 'polearm'],
  Lynette: [4, 'anemo', 'sword'],
  Lyney: [5, 'pyro', 'bow'],
  Mavuika: [5, 'pyro', 'claymore'],
  Mika: [4, 'cryo', 'polearm'],
  Mona: [5, 'hydro', 'catalyst'],
  Mualani: [5, 'hydro', 'catalyst'],
  Nahida: [5, 'dendro', 'catalyst'],
  Navia: [5, 'geo', 'claymore'],
  Nefer: [5, 'dendro', 'catalyst'],
  Neuvillette: [5, 'hydro', 'catalyst'],
  Nicole: [5, 'pyro', 'catalyst'],
  Nilou: [5, 'hydro', 'sword'],
  Ningguang: [4, 'geo', 'catalyst'],
  Noelle: [4, 'geo', 'claymore'],
  Odette: [5, 'cryo', 'sword'],
  Ororon: [4, 'electro', 'bow'],
  Prune: [4, 'anemo', 'catalyst'],
  Qiqi: [5, 'cryo', 'sword'],
  RaidenShogun: [5, 'electro', 'polearm'],
  Razor: [4, 'electro', 'claymore'],
  Rosaria: [4, 'cryo', 'polearm'],
  Sandrone: [5, 'cryo', 'claymore'],
  SangonomiyaKokomi: [5, 'hydro', 'catalyst'],
  Sayu: [4, 'anemo', 'claymore'],
  Sethos: [4, 'electro', 'bow'],
  Shenhe: [5, 'cryo', 'polearm'],
  ShikanoinHeizou: [4, 'anemo', 'catalyst'],
  Sigewinne: [5, 'hydro', 'bow'],
  Skirk: [5, 'cryo', 'sword'],
  Somnia: [5, 'electro', 'catalyst'],
  Sucrose: [4, 'anemo', 'catalyst'],
  Tartaglia: [5, 'hydro', 'bow'],
  Thoma: [4, 'pyro', 'polearm'],
  Tighnari: [5, 'dendro', 'bow'],
  Traveler: [5, null, 'sword'],
  Varesa: [5, 'electro', 'catalyst'],
  Varka: [5, 'anemo', 'claymore'],
  Venti: [5, 'anemo', 'bow'],
  Wanderer: [5, 'anemo', 'catalyst'],
  Wriothesley: [5, 'cryo', 'catalyst'],
  Xiangling: [4, 'pyro', 'polearm'],
  Xianyun: [5, 'anemo', 'catalyst'],
  Xiao: [5, 'anemo', 'polearm'],
  Xilonen: [5, 'geo', 'sword'],
  Xingqiu: [4, 'hydro', 'sword'],
  Xinyan: [4, 'pyro', 'claymore'],
  YaeMiko: [5, 'electro', 'catalyst'],
  Yanfei: [4, 'pyro', 'catalyst'],
  Yaoyao: [4, 'dendro', 'polearm'],
  Yelan: [5, 'hydro', 'bow'],
  Yoimiya: [5, 'pyro', 'bow'],
  YumemizukiMizuki: [5, 'anemo', 'catalyst'],
  YunJin: [4, 'geo', 'polearm'],
  Zhongli: [5, 'geo', 'polearm'],
  Zibai: [5, 'geo', 'sword'],
}

/**
 * Artifact main stat value by rarity, stat key and level (index = level).
 * Percent stats are in percent (46.6 = 46.6%), as GOOD substats are.
 */
export const ARTIFACT_MAIN_STATS: Readonly<
  Record<number, Readonly<Record<string, readonly number[]>>>
> = {
  1: {
    hp: [129, 178, 227, 275, 324],
    hp_: [3.1, 4.3, 5.5, 6.7, 7.9],
    atk: [8, 12, 15, 18, 21],
    atk_: [3.1, 4.3, 5.5, 6.7, 7.9],
    def_: [3.9, 5.4, 6.9, 8.4, 9.9],
    critRate_: [2.1, 2.9, 3.7, 4.5, 5.3],
    critDMG_: [4.2, 5.8, 7.4, 9, 10.5],
    eleMas: [12.6, 17.3, 22.1, 26.9, 31.6],
    enerRech_: [3.5, 4.8, 6.1, 7.5, 8.8],
    heal_: [2.4, 3.3, 4.3, 5.2, 6.1],
    physical_dmg_: [3.9, 5.4, 6.9, 8.4, 9.9],
    electro_dmg_: [3.1, 4.3, 5.5, 6.7, 7.9],
    geo_dmg_: [3.1, 4.3, 5.5, 6.7, 7.9],
    pyro_dmg_: [3.1, 4.3, 5.5, 6.7, 7.9],
    hydro_dmg_: [3.1, 4.3, 5.5, 6.7, 7.9],
    cryo_dmg_: [3.1, 4.3, 5.5, 6.7, 7.9],
    anemo_dmg_: [3.1, 4.3, 5.5, 6.7, 7.9],
    dendro_dmg_: [3.1, 4.3, 5.5, 6.7, 7.9],
  },
  2: {
    hp: [258, 331, 404, 478, 551, 624, 697, 770, 843],
    hp_: [4.2, 5.4, 6.6, 7.8, 9, 10.1, 11.3, 12.5, 13.7],
    atk: [17, 22, 26, 31, 36, 41, 45, 50, 55],
    atk_: [4.2, 5.4, 6.6, 7.8, 9, 10.1, 11.3, 12.5, 13.7],
    def_: [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1],
    critRate_: [2.8, 3.6, 4.4, 5.2, 6, 6.8, 7.6, 8.3, 9.1],
    critDMG_: [5.6, 7.2, 8.8, 10.4, 11.9, 13.5, 15.1, 16.7, 18.3],
    eleMas: [16.8, 21.5, 26.3, 31.1, 35.8, 40.6, 45.3, 50.1, 54.8],
    enerRech_: [4.7, 6, 7.3, 8.6, 9.9, 11.3, 12.6, 13.9, 15.2],
    heal_: [3.2, 4.1, 5.1, 6, 6.9, 7.8, 8.7, 9.6, 10.5],
    physical_dmg_: [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1],
    electro_dmg_: [4.2, 5.4, 6.6, 7.8, 9, 10.1, 11.3, 12.5, 13.7],
    geo_dmg_: [4.2, 5.4, 6.6, 7.8, 9, 10.1, 11.3, 12.5, 13.7],
    pyro_dmg_: [4.2, 5.4, 6.6, 7.8, 9, 10.1, 11.3, 12.5, 13.7],
    hydro_dmg_: [4.2, 5.4, 6.6, 7.8, 9, 10.1, 11.3, 12.5, 13.7],
    cryo_dmg_: [4.2, 5.4, 6.6, 7.8, 9, 10.1, 11.3, 12.5, 13.7],
    anemo_dmg_: [4.2, 5.4, 6.6, 7.8, 9, 10.1, 11.3, 12.5, 13.7],
    dendro_dmg_: [4.2, 5.4, 6.6, 7.8, 9, 10.1, 11.3, 12.5, 13.7],
  },
  3: {
    hp: [430, 552, 674, 796, 918, 1040, 1162, 1283, 1405, 1527, 1649, 1771, 1893],
    hp_: [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
    atk: [28, 36, 44, 52, 60, 68, 76, 84, 91, 99, 107, 115, 123],
    atk_: [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
    def_: [6.6, 8.4, 10.3, 12.1, 14, 15.8, 17.7, 19.6, 21.4, 23.3, 25.1, 27, 28.8],
    critRate_: [3.5, 4.5, 5.5, 6.5, 7.5, 8.4, 9.4, 10.4, 11.4, 12.4, 13.4, 14.4, 15.4],
    critDMG_: [7, 9, 11, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8],
    eleMas: [21, 26.9, 32.9, 38.8, 44.8, 50.7, 56.7, 62.6, 68.5, 74.5, 80.4, 86.4, 92.3],
    enerRech_: [5.8, 7.5, 9.1, 10.8, 12.4, 14.1, 15.7, 17.4, 19, 20.7, 22.3, 24, 25.6],
    heal_: [4, 5.2, 6.3, 7.5, 8.6, 9.8, 10.9, 12, 13.2, 14.3, 15.5, 16.6, 17.8],
    physical_dmg_: [6.6, 8.4, 10.3, 12.1, 14, 15.8, 17.7, 19.6, 21.4, 23.3, 25.1, 27, 28.8],
    electro_dmg_: [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
    geo_dmg_: [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
    pyro_dmg_: [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
    hydro_dmg_: [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
    cryo_dmg_: [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
    anemo_dmg_: [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
    dendro_dmg_: [5.2, 6.7, 8.2, 9.7, 11.2, 12.7, 14.2, 15.6, 17.1, 18.6, 20.1, 21.6, 23.1],
  },
  4: {
    hp: [
      645, 828, 1011, 1194, 1377, 1559, 1742, 1925, 2108, 2291, 2474, 2657, 2839, 3022, 3205, 3388,
      3571,
    ],
    hp_: [
      6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33, 34.8,
    ],
    atk: [42, 54, 66, 78, 90, 102, 113, 125, 137, 149, 161, 173, 185, 197, 209, 221, 232],
    atk_: [
      6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33, 34.8,
    ],
    def_: [
      7.9, 10.1, 12.3, 14.6, 16.8, 19, 21.2, 23.5, 25.7, 27.9, 30.2, 32.4, 34.6, 36.8, 39.1, 41.3,
      43.5,
    ],
    critRate_: [
      4.2, 5.4, 6.6, 7.8, 9, 10.1, 11.3, 12.5, 13.7, 14.9, 16.1, 17.3, 18.5, 19.7, 20.8, 22, 23.2,
    ],
    critDMG_: [
      8.4, 10.8, 13.1, 15.5, 17.9, 20.3, 22.7, 25, 27.4, 29.8, 32.2, 34.5, 36.9, 39.3, 41.7, 44.1,
      46.4,
    ],
    eleMas: [
      25.2, 32.3, 39.4, 46.6, 53.7, 60.8, 68, 75.1, 82.2, 89.4, 96.5, 103.6, 110.8, 117.9, 125,
      132.2, 139.3,
    ],
    enerRech_: [
      7, 9, 11, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7,
    ],
    heal_: [
      4.8, 6.2, 7.6, 9, 10.3, 11.7, 13.1, 14.4, 15.8, 17.2, 18.6, 19.9, 21.3, 22.7, 24, 25.4, 26.8,
    ],
    physical_dmg_: [
      7.9, 10.1, 12.3, 14.6, 16.8, 19, 21.2, 23.5, 25.7, 27.9, 30.2, 32.4, 34.6, 36.8, 39.1, 41.3,
      43.5,
    ],
    electro_dmg_: [
      6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33, 34.8,
    ],
    geo_dmg_: [
      6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33, 34.8,
    ],
    pyro_dmg_: [
      6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33, 34.8,
    ],
    hydro_dmg_: [
      6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33, 34.8,
    ],
    cryo_dmg_: [
      6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33, 34.8,
    ],
    anemo_dmg_: [
      6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33, 34.8,
    ],
    dendro_dmg_: [
      6.3, 8.1, 9.9, 11.6, 13.4, 15.2, 17, 18.8, 20.6, 22.3, 24.1, 25.9, 27.7, 29.5, 31.3, 33, 34.8,
    ],
  },
  5: {
    hp: [
      717, 920, 1123, 1326, 1530, 1733, 1936, 2139, 2342, 2545, 2749, 2952, 3155, 3358, 3561, 3764,
      3967, 4171, 4374, 4577, 4780,
    ],
    hp_: [
      7, 9, 11, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7,
      40.7, 42.7, 44.6, 46.6,
    ],
    atk: [
      47, 60, 73, 86, 100, 113, 126, 139, 152, 166, 179, 192, 205, 219, 232, 245, 258, 272, 285,
      298, 311,
    ],
    atk_: [
      7, 9, 11, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7,
      40.7, 42.7, 44.6, 46.6,
    ],
    def_: [
      8.7, 11.2, 13.7, 16.2, 18.6, 21.1, 23.6, 26.1, 28.6, 31, 33.5, 36, 38.5, 40.9, 43.4, 45.9,
      48.4, 50.8, 53.3, 55.8, 58.3,
    ],
    critRate_: [
      4.7, 6, 7.3, 8.6, 9.9, 11.3, 12.6, 13.9, 15.2, 16.6, 17.9, 19.2, 20.5, 21.8, 23.2, 24.5, 25.8,
      27.1, 28.4, 29.8, 31.1,
    ],
    critDMG_: [
      9.3, 12, 14.6, 17.3, 19.9, 22.5, 25.2, 27.8, 30.5, 33.1, 35.7, 38.4, 41, 43.7, 46.3, 49, 51.6,
      54.2, 56.9, 59.5, 62.2,
    ],
    eleMas: [
      28, 35.9, 43.8, 51.8, 59.7, 67.6, 75.5, 83.5, 91.4, 99.3, 107.2, 115.2, 123.1, 131, 138.9,
      146.9, 154.8, 162.7, 170.6, 178.6, 186.5,
    ],
    enerRech_: [
      7.8, 10, 12.2, 14.4, 16.6, 18.8, 21, 23.2, 25.4, 27.6, 29.8, 32, 34.2, 36.4, 38.6, 40.8, 43,
      45.2, 47.4, 49.6, 51.8,
    ],
    heal_: [
      5.4, 6.9, 8.4, 10, 11.5, 13, 14.5, 16.1, 17.6, 19.1, 20.6, 22.1, 23.7, 25.2, 26.7, 28.2, 29.8,
      31.3, 32.8, 34.3, 35.9,
    ],
    physical_dmg_: [
      8.7, 11.2, 13.7, 16.2, 18.6, 21.1, 23.6, 26.1, 28.6, 31, 33.5, 36, 38.5, 40.9, 43.4, 45.9,
      48.4, 50.8, 53.3, 55.8, 58.3,
    ],
    electro_dmg_: [
      7, 9, 11, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7,
      40.7, 42.7, 44.6, 46.6,
    ],
    geo_dmg_: [
      7, 9, 11, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7,
      40.7, 42.7, 44.6, 46.6,
    ],
    pyro_dmg_: [
      7, 9, 11, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7,
      40.7, 42.7, 44.6, 46.6,
    ],
    hydro_dmg_: [
      7, 9, 11, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7,
      40.7, 42.7, 44.6, 46.6,
    ],
    cryo_dmg_: [
      7, 9, 11, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7,
      40.7, 42.7, 44.6, 46.6,
    ],
    anemo_dmg_: [
      7, 9, 11, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7,
      40.7, 42.7, 44.6, 46.6,
    ],
    dendro_dmg_: [
      7, 9, 11, 12.9, 14.9, 16.9, 18.9, 20.9, 22.8, 24.8, 26.8, 28.8, 30.8, 32.8, 34.7, 36.7, 38.7,
      40.7, 42.7, 44.6, 46.6,
    ],
  },
}

/** Sets whose bonuses are not the usual 2 and 4 pieces. */
export const ARTIFACT_SET_THRESHOLDS: Readonly<Record<string, readonly number[]>> = {
  PrayersForIllumination: [1],
  PrayersForDestiny: [1],
  PrayersForWisdom: [1],
  PrayersToSpringtime: [1],
}
