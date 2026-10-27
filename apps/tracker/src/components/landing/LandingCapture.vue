<script setup lang="ts">
import {
  CircleCheck,
  Download,
  Eye,
  FileBraces,
  Minus,
  Power,
  Settings,
  Shield,
  UserRoundCheck,
  X,
} from 'lucide-vue-next'
import { formatNumber } from '@/lib/format'
import { DOWNLOAD_URL } from './links'

/** The capture app's section: what it does, its platforms, and a mock of its window (sample data). */
const tiles = [
  { key: 'characters', value: 92, wide: false },
  { key: 'weapons', value: 341, wide: false },
  { key: 'artifacts', value: 1684, wide: false },
  { key: 'materials', value: 412, wide: true },
  { key: 'achievements', value: 1207, wide: true },
] as const
</script>

<template>
  <section id="capture" class="sec band" aria-labelledby="cap-t">
    <div class="wrap">
      <div class="split">
        <div class="split-txt">
          <div class="sec-h">
            <div class="ov">{{ $t('landing.capture.overline') }}</div>
            <h2 id="cap-t" class="h2">{{ $t('landing.capture.title') }}</h2>
            <p class="lead">{{ $t('landing.capture.lead') }}</p>
          </div>
          <ul class="facts">
            <li>
              <UserRoundCheck class="ic" aria-hidden="true" />
              <div>
                <b>{{ $t('landing.capture.noAccount') }}</b
                ><span>{{ $t('landing.capture.noAccountNote') }}</span>
              </div>
            </li>
            <li>
              <Eye class="ic" aria-hidden="true" />
              <div>
                <b>{{ $t('landing.capture.readOnly') }}</b
                ><span>{{ $t('landing.capture.readOnlyNote') }}</span>
              </div>
            </li>
            <li>
              <FileBraces class="ic" aria-hidden="true" />
              <div>
                <b>GOOD JSON</b
                ><span :title="$t('landing.capture.goodTip')">{{
                  $t('landing.capture.goodNote')
                }}</span>
              </div>
            </li>
            <li class="note">
              <Power class="ic" aria-hidden="true" />
              <div>
                <b>{{ $t('landing.capture.first') }}</b
                ><span>{{ $t('landing.capture.firstNote') }}</span>
              </div>
            </li>
            <li class="note">
              <Shield class="ic" aria-hidden="true" />
              <div>
                <b>{{ $t('landing.capture.admin') }}</b
                ><span>{{ $t('landing.capture.adminNote') }}</span>
              </div>
            </li>
          </ul>
          <ul class="chips" :aria-label="$t('landing.capture.platforms')">
            <li class="chip main">Windows</li>
            <li class="chip">Linux</li>
            <li class="chip">macOS</li>
            <li class="chip main">Android</li>
          </ul>
          <div class="acts">
            <a class="btn btn-p" :href="DOWNLOAD_URL">
              <Download class="ic" aria-hidden="true" />{{ $t('landing.capture.releases') }}
            </a>
            <span class="muted">{{ $t('landing.capture.free') }}</span>
          </div>
        </div>

        <div class="win" role="img" :aria-label="$t('landing.capture.window')">
          <div class="tbar" aria-hidden="true">
            <div class="wbrand"><span class="spark">✦</span>Teyvat.me <small>Capture</small></div>
            <div class="drag" />
            <span class="wbtn"><Settings class="ic s" /></span>
            <span class="wbtn"><Minus class="ic s" /></span>
            <span class="wbtn"><X class="ic s" /></span>
          </div>
          <div class="wmain" aria-hidden="true">
            <div class="colm">
              <div class="hero">
                <div class="hi">
                  <div class="disc"><CircleCheck class="ic" /></div>
                  <div class="rt">
                    <div class="ht">{{ $t('landing.capture.decrypting') }}</div>
                    <span class="tab">{{ $t('landing.capture.keyFound', { time: '21:02' }) }}</span>
                  </div>
                </div>
                <div class="steps">
                  <div class="st"><i />{{ $t('landing.capture.stepCapture') }}</div>
                  <div class="st"><i />{{ $t('landing.capture.stepLogin') }}</div>
                  <div class="st"><i />{{ $t('landing.capture.stepKey') }}</div>
                </div>
              </div>
              <div class="card">
                <div class="ch">
                  <span class="ct"
                    >{{ $t('game.traveler')
                    }}<small>{{ $t('game.ar') }} 60 · {{ $t('accounts.server.ASIA') }}</small></span
                  >
                </div>
                <div class="tiles">
                  <div v-for="tile in tiles" :key="tile.key" class="tl" :class="{ w: tile.wide }">
                    <b>{{ formatNumber(tile.value) }}</b
                    ><span>{{ $t(`game.${tile.key}`) }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="colm">
              <div class="card">
                <div class="ch">
                  <span class="ct">{{ $t('landing.capture.export') }}</span>
                </div>
                <div class="row" style="gap: 8px">
                  <span class="wb"><Download class="ic s" />{{ $t('landing.capture.save') }}</span>
                  <span class="wb sec">{{ $t('landing.capture.copy') }}</span>
                </div>
              </div>
              <div class="card">
                <div class="ch">
                  <span class="ct">teyvat.me</span>
                  <span class="pill pill-ac">{{ $t('landing.steps.optional') }}</span>
                </div>
                <div class="wrow">
                  <div class="wav">P</div>
                  <div class="rt">
                    <b>{{ $t('landing.capture.signedInAs', { name: 'player01' }) }}</b>
                    <span>{{ $t('landing.capture.uploads') }}</span>
                  </div>
                </div>
                <div class="dv" />
                <div class="wrow">
                  <div class="rt">
                    <b>{{ $t('landing.capture.autoExport') }}</b>
                    <span class="tab"
                      ><span class="okt">✓</span>
                      {{ $t('landing.capture.uploaded', { time: '21:04' }) }}</span
                    >
                  </div>
                  <span class="sw"><i /></span>
                </div>
              </div>
            </div>
          </div>
          <div class="wfoot" aria-hidden="true">
            <span class="dot" /><span>{{ $t('landing.capture.on') }}</span
            ><span class="fsep" /><span class="tab">{{
              $t('landing.capture.saved', { time: '21:04' })
            }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
