/** The share card's canvas (ShareCard), in CSS pixels. */
export const CARD_WIDTH = 1280
export const CARD_HEIGHT = 720
/** The PNG is drawn at 1.5×: 1920×1080. */
export const CARD_SCALE = 1.5

/** What the card's foot shows of its owner; null parts are left out. */
export interface CardOwner {
  name: string | null
  uid: string | null
  /** Adventure Rank, from the newest capture. */
  ar: number | null
}
