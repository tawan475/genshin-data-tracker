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

/** The original y-axis ticks: 1.2M, 35K, else the plain number. */
export function abbreviateTick(value: string | number): string | number {
  const v = Number(value)
  return v >= 1_000_000
    ? `${(v / 1_000_000).toFixed(1)}M`
    : v >= 1_000
      ? `${(v / 1_000).toFixed(0)}K`
      : v
}
