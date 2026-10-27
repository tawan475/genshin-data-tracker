<script setup lang="ts">
import { Download } from 'lucide-vue-next'
import { useSession } from '@/stores/session'
import DemoVideo from './DemoVideo.vue'
import { DOWNLOAD_URL } from './links'

const session = useSession()
</script>

<template>
  <section class="sky e-hero" aria-labelledby="he-title">
    <div class="wrap e-band">
      <div class="e-txt">
        <h1 id="he-title" class="h1"><span class="spark" aria-hidden="true">✦</span> Teyvat.me</h1>
        <p class="lead">{{ $t('landing.hero.lead') }}</p>
        <div class="acts">
          <a class="btn btn-p" :href="DOWNLOAD_URL">
            <Download class="ic" aria-hidden="true" />{{ $t('landing.hero.download') }}
          </a>
          <RouterLink
            v-if="session.status === 'signed-in'"
            :to="{ name: 'home' }"
            class="btn btn-g"
          >
            {{ $t('landing.hero.open') }}
          </RouterLink>
          <RouterLink v-else :to="{ name: 'register' }" class="btn btn-g">
            {{ $t('landing.hero.track') }}
          </RouterLink>
        </div>
        <p class="muted e-note">{{ $t('landing.hero.note') }}</p>
      </div>
      <div class="e-media">
        <DemoVideo />
      </div>
    </div>
  </section>
</template>
