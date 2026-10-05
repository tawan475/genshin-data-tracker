import { ref, watch, type Ref } from 'vue'
import { parseChartRange, type ChartRange } from '@/data/chart-range'
import { readStorage, writeStorage } from '@/lib/storage'

/**
 * A chart's range, remembered on this device under `key`. A stored range
 * that is no longer offered (90d) reads as the default.
 */
export function useChartRange(key: string): Ref<ChartRange> {
  const range = ref<ChartRange>(parseChartRange(readStorage(key)))
  watch(range, (value) => writeStorage(key, value))
  return range
}
