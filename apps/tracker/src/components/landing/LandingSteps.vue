<script setup lang="ts">
import { Cloud, FileBraces, Gamepad2, Power } from 'lucide-vue-next'
</script>

<template>
  <section id="how" class="sec band" aria-labelledby="how-t">
    <div class="wrap">
      <div class="sec-h c">
        <div class="ov">{{ $t('landing.steps.overline') }}</div>
        <h2 id="how-t" class="h2">{{ $t('landing.steps.title') }}</h2>
      </div>
      <ol class="steps3">
        <li class="glass step">
          <div class="step-top">
            <span class="num">1</span><Power class="ic xl step-ic" aria-hidden="true" />
          </div>
          <h3 class="h3">{{ $t('landing.steps.start') }}</h3>
          <span class="muted step-note">{{ $t('landing.steps.startNote') }}</span>
        </li>
        <li class="glass step">
          <div class="step-top">
            <span class="num">2</span><Gamepad2 class="ic xl step-ic" aria-hidden="true" />
          </div>
          <h3 class="h3">{{ $t('landing.steps.login') }}</h3>
          <span class="muted step-note">{{ $t('landing.steps.loginNote') }}</span>
        </li>
        <li class="glass step">
          <div class="step-top">
            <span class="num">3</span><FileBraces class="ic xl step-ic" aria-hidden="true" />
          </div>
          <h3 class="h3">{{ $t('landing.steps.exported') }}</h3>
          <span class="muted step-note">GOOD JSON</span>
        </li>
      </ol>
      <div class="glass opt">
        <Cloud class="ic l" aria-hidden="true" />
        <b>{{ $t('landing.steps.connect') }}</b>
        <span class="pill pill-ac">{{ $t('landing.steps.optional') }}</span>
        <span class="muted step-note" :title="$t('landing.steps.connectTip')">{{
          $t('landing.steps.connectNote')
        }}</span>
      </div>
    </div>
  </section>
</template>
