/**
 * Column widths shared by the day headers (labels) and the rows (figures),
 * so the figures line up from md up. Below md rows are cards and these are
 * not applied.
 */
export const COLUMN = {
  artifacts: 'md:w-20',
  mora: 'md:w-24',
  uploaded: 'md:w-20',
  stored: 'md:w-20',
  /** Two 44px icon buttons. */
  actions: 'w-22',
} as const
