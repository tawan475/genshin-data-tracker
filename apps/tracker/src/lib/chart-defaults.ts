/**
 * The app's type on every Chart.js chart: Outfit for axis ticks, legends and
 * tooltips (Chart.js otherwise draws its own Helvetica/Arial stack). Import
 * this module from each chart component; it only sets defaults.
 */
import { Chart } from 'chart.js'

export const CHART_FONT = "'Outfit', ui-sans-serif, system-ui, sans-serif"

Chart.defaults.font.family = CHART_FONT
Chart.defaults.font.size = 12
