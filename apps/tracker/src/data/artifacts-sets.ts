/**
 * In-game names of artifact sets whose GOOD key does not space out into the
 * right name (apostrophes, hyphens, lower-case "of"/"the"). Any set not
 * listed reads fine through keyToName. Taken from the game's set table.
 */
export const ARTIFACT_SET_NAMES: Readonly<Record<string, string>> = {
  AubadeOfMorningstarAndMoon: 'Aubade of Morningstar and Moon',
  CrimsonWitchOfFlames: 'Crimson Witch of Flames',
  DefendersWill: "Defender's Will",
  EchoesOfAnOffering: 'Echoes of an Offering',
  EmblemOfSeveredFate: 'Emblem of Severed Fate',
  FinaleOfTheDeepGalleries: 'Finale of the Deep Galleries',
  FlowerOfParadiseLost: 'Flower of Paradise Lost',
  FragmentOfHarmonicWhimsy: 'Fragment of Harmonic Whimsy',
  GlacierAndSnowfield: 'Glacier and Snowfield',
  GladiatorsFinale: "Gladiator's Finale",
  HeartOfDepth: 'Heart of Depth',
  HuskOfOpulentDreams: 'Husk of Opulent Dreams',
  LongNightsOath: "Long Night's Oath",
  NightOfTheSkysUnveiling: "Night of the Sky's Unveiling",
  NighttimeWhispersInTheEchoingWoods: 'Nighttime Whispers in the Echoing Woods',
  NymphsDream: "Nymph's Dream",
  OceanHuedClam: 'Ocean-Hued Clam',
  PrayersForDestiny: 'Prayers for Destiny',
  PrayersForIllumination: 'Prayers for Illumination',
  PrayersForWisdom: 'Prayers for Wisdom',
  PrayersToSpringtime: 'Prayers to Springtime',
  PrayersToTheFirmament: 'Prayers to the Firmament',
  ResolutionOfSojourner: 'Resolution of Sojourner',
  ScrollOfTheHeroOfCinderCity: 'Scroll of the Hero of Cinder City',
  ShimenawasReminiscence: "Shimenawa's Reminiscence",
  SilkenMoonsSerenade: "Silken Moon's Serenade",
  SongOfDaysPast: 'Song of Days Past',
  TenacityOfTheMillelith: 'Tenacity of the Millelith',
  VourukashasGlow: "Vourukasha's Glow",
  WanderersTroupe: "Wanderer's Troupe",
}
