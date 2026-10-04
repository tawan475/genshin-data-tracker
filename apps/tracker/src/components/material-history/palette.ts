/** The original material chart colours, one per series in selection order. */
const CHART_COLORS = [
  '#0ea5e9',
  '#eab308',
  '#22c55e',
  '#a855f7',
  '#f97316',
  '#ec4899',
  '#14b8a6',
  '#ef4444',
  '#6366f1',
  '#84cc16',
]

export function materialChartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length]!
}

export function materialChartBg(color: string): string {
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, 0.08)`
}
