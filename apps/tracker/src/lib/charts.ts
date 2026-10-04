/**
 * Chart.js as the original tracker used it: vue-chartjs `<Line>` with the
 * zoom plugin (wheel/pinch to zoom, drag to pan on the x axis). Import this
 * module once from any view that draws a chart.
 */
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'
import zoomPlugin from 'chartjs-plugin-zoom'
import './chart-defaults'

Chart.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  zoomPlugin,
)

/**
 * The original y-axis ticks (72.2M, 35K), with two fixes: 2,500 reads 2.5K
 * rather than repeating 3K, and losses are abbreviated like gains.
 */
export function abbreviateTick(value: string | number): string | number {
  const v = Number(value)
  const size = Math.abs(v)
  if (size >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (size >= 1_000) return `${Number((v / 1_000).toFixed(1))}K`
  return v
}
