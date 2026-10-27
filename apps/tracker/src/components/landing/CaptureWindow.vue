<script setup lang="ts">
import { computed } from 'vue'
import {
  CircleCheck,
  Copy,
  Download,
  Droplet,
  Ellipsis,
  Folder,
  History,
  Hourglass,
  House,
  ListChecks,
  MessageSquare,
  Minus,
  Moon,
  Settings,
  Square,
  Star,
  Sword,
  X,
} from 'lucide-vue-next'
import { t } from '@/i18n'
import { dateFormat, formatNumber } from '@/lib/format'

/**
 * The capture section's picture of the Teyvat.me Capture app as it is now
 * (after its demo recording): decoration with placeholder numbers, one
 * labelled image to screen readers, nothing focusable.
 */
const tiles = computed(() => [
  { label: t('game.characters'), value: 92 },
  { label: t('game.weapons'), value: 341 },
  { label: t('game.artifacts'), value: 1684 },
  { label: t('game.materials'), value: 412 },
  { label: t('game.achievements'), value: 1207 },
  { label: t('shell.nav.anecdotes'), value: 96 },
])

/** "Wed 18:40": a Wednesday's short name in the language on screen. */
const resinFull = computed(
  () => `${dateFormat({ weekday: 'short' }).format(new Date(2026, 9, 28))} 18:40`,
)
const of = (value: number, total: number) => `${formatNumber(value)} / ${formatNumber(total)}`
</script>

<template>
  <div class="cw" role="img" :aria-label="$t('landing.capture.window')">
    <div class="cw-bar-t" aria-hidden="true">
      <span class="spark">✦</span><span>Teyvat.me Capture</span><span class="cw-grow" />
      <span class="cw-wb"><Minus class="ic s" /></span>
      <span class="cw-wb"><Square class="ic s" /></span>
      <span class="cw-wb"><X class="ic s" /></span>
    </div>
    <div class="cw-body" aria-hidden="true">
      <div class="cw-status">
        <div class="cw-disc"><CircleCheck class="ic" /></div>
        <div class="cw-st">
          <b>{{ $t('landing.capture.decrypting') }}</b>
          <span class="tab">{{ $t('landing.capture.keyFound', { time: '21:02' }) }}</span>
        </div>
        <div class="cw-steps">
          <div><i />{{ $t('landing.capture.stepCapture') }}</div>
          <div><i />{{ $t('landing.video.chapter.open') }}</div>
          <div><i />{{ $t('landing.video.chapter.world') }}</div>
        </div>
        <div class="cw-icons">
          <History class="ic s" /><Moon class="ic s" /><Settings class="ic s" /><MessageSquare
            class="ic s"
          />
        </div>
      </div>
      <div class="cw-grid">
        <div class="cw-card">
          <div class="cw-ch">
            <b>{{ $t('landing.capture.captured') }}</b>
            <small
              >{{ $t('game.ar') }} 60 · {{ $t('game.wl') }} 8 ·
              {{ $t('accounts.server.ASIA') }}</small
            >
            <span class="cw-grow" />
            <small>21:02 · {{ $t('format.justNow') }}</small>
          </div>
          <div class="cw-tiles">
            <div v-for="tile in tiles" :key="tile.label">
              <b>{{ formatNumber(tile.value) }}</b
              ><span>{{ tile.label }}</span>
            </div>
          </div>
        </div>
        <div class="cw-card">
          <div class="cw-ch">
            <b>{{ $t('format.today') }}</b
            ><span class="cw-grow" />
            <small>{{ $t('landing.capture.atLogin', { time: '21:02' }) }}</small>
          </div>
          <div class="cw-today">
            <div class="cw-td">
              <Droplet class="ic s" />
              <div class="cw-tr">
                <div class="cw-tn">
                  <span>{{ $t('materials.wallet.short.OriginalResin') }}</span
                  ><b>{{ of(120, 200) }}</b>
                </div>
                <span class="cw-bar"><i style="width: 60%" /></span>
                <small>{{ $t('landing.capture.resinFull', { time: resinFull }) }}</small>
              </div>
            </div>
            <div class="cw-td">
              <House class="ic s" />
              <div class="cw-tr">
                <div class="cw-tn">
                  <span>{{ $t('planner.task.builtin.realm') }}</span
                  ><b>{{ of(1380, 2400) }}</b>
                </div>
                <span class="cw-bar"><i style="width: 58%" /></span>
                <small />
              </div>
            </div>
            <div class="cw-td">
              <ListChecks class="ic s" />
              <div class="cw-tr">
                <div class="cw-tn">
                  <span>{{ $t('landing.capture.commissions') }}</span
                  ><b>{{ of(4, 4) }}</b>
                </div>
                <small class="ok">{{ $t('landing.capture.doneToday') }}</small>
              </div>
            </div>
            <div class="cw-td">
              <Hourglass class="ic s" />
              <div class="cw-tr">
                <div class="cw-tn">
                  <span>{{ $t('planner.task.builtin.expeditions') }}</span
                  ><b>{{ $t('landing.capture.expeditionsOut', { n: 5 }) }}</b>
                </div>
                <small>{{ $t('landing.capture.firstBack', { time: '06:10' }) }}</small>
              </div>
            </div>
            <div class="cw-td">
              <Sword class="ic s" />
              <div class="cw-tr">
                <div class="cw-tn">
                  <span>{{ $t('planner.material.group.weekly') }}</span
                  ><b>{{ of(3, 3) }}</b>
                </div>
                <small>{{ $t('landing.capture.discountsLeft') }}</small>
              </div>
            </div>
            <div class="cw-td">
              <Star class="ic s" />
              <div class="cw-tr">
                <div class="cw-tn">
                  <span>{{ $t('planner.task.builtin.abyss') }}</span
                  ><b>{{ of(36, 36) }}</b>
                </div>
                <small>{{ $t('landing.capture.abyssResets', { n: 20 }) }}</small>
              </div>
            </div>
          </div>
        </div>
        <div class="cw-card">
          <div class="cw-ch">
            <b>{{ $t('landing.capture.export') }}</b
            ><span class="cw-grow" />
            <span class="cw-ib"><Folder class="ic s" /></span>
            <span class="cw-ib"><Ellipsis class="ic s" /></span>
          </div>
          <div class="cw-row">
            <span class="cw-btn"><Download class="ic s" />{{ $t('landing.capture.save') }}</span>
            <span class="cw-btn alt"><Copy class="ic s" />{{ $t('common.copy') }}</span>
          </div>
          <div class="cw-dv" />
          <div class="cw-sw-row">
            <div>
              <b>{{ $t('landing.capture.autoExport') }}</b>
              <span>{{
                $t('landing.capture.savedFile', {
                  time: '21:02',
                  file: 'teyvatme_2026-10-27.json',
                })
              }}</span>
            </div>
            <span class="cw-sw on"><i /></span>
          </div>
        </div>
        <div class="cw-card">
          <div class="cw-ch">
            <b>{{ $t('wishes.title') }}</b
            ><span class="cw-grow" />
            <small>{{ $t('landing.capture.wishFirst') }}</small>
          </div>
          <div class="cw-row">
            <span class="cw-btn alt"><Copy class="ic s" />{{ $t('landing.capture.copyUrl') }}</span>
            <span class="cw-lnk">paimon.moe</span><span class="cw-lnk">StarDB</span>
          </div>
          <div class="cw-dv" />
          <div class="cw-sw-row">
            <div>
              <b>{{ $t('landing.capture.sendWishes') }}</b>
              <span>{{ $t('landing.capture.sendWishesNote') }}</span>
            </div>
            <span class="cw-sw on"><i /></span>
          </div>
        </div>
      </div>
      <div class="cw-foot">
        <div class="cw-av">P</div>
        <div class="cw-ft">
          <b>teyvat.me ↗ · player01</b>
          <span
            ><span class="ok">✓</span>
            {{ $t('landing.capture.liveSync', { n: 38, time: '21:04' }) }}</span
          >
        </div>
        <span class="cw-grow" />
        <span class="cw-fl">{{ $t('landing.nav.tracker') }}</span
        ><span class="cw-sw on"><i /></span>
      </div>
    </div>
  </div>
</template>
