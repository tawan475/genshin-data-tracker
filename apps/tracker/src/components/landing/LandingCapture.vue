<script setup lang="ts">
import { Download, Eye, FileBraces, Power, Shield, UserRoundCheck } from 'lucide-vue-next'
import CaptureWindow from './CaptureWindow.vue'
import { DOWNLOAD_URL } from './links'
</script>

<template>
  <section id="capture" class="sec band" aria-labelledby="cap-t">
    <div class="wrap">
      <div class="split cap">
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
                <b>Leyline JSON</b
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

        <CaptureWindow />
      </div>
    </div>
  </section>
</template>
