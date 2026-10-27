<script setup lang="ts">
import { computed, ref } from 'vue'
import { ClipboardList, Globe, Power, TrendingUp } from 'lucide-vue-next'
import { useRoute } from 'vue-router'
import AppearanceControls from '@/components/settings/AppearanceControls.vue'
import UiModal from '@/components/ui/UiModal.vue'
import { LANGUAGE_NAMES } from '@/i18n/language-names'
import { locale } from '@/i18n/locale'
import { formatNumber } from '@/lib/format'
import { useSession } from '@/stores/session'
import '@/components/landing/landing.css'
import '@/components/auth/auth.css'

/**
 * The sign-in pages' frame (design "Sign-in B"): the landing's top bar, the
 * brand panel on the left, the form on the right; on phones the panel
 * shrinks to a small heading above the form. Always dark (a public route).
 */
defineProps<{ title: string; subtitle?: string }>()

const session = useSession()
const route = useRoute()
const languageOpen = ref(false)
const languageName = computed(() => LANGUAGE_NAMES[locale.value])
const short = computed(() => locale.value.split('-')[0]!.toUpperCase())

/** The top bar's one button: where this page isn't. */
const cta = computed(() =>
  session.status === 'signed-in'
    ? { to: { name: 'home' }, label: 'shell.public.dashboard' }
    : route.name === 'login'
      ? { to: { name: 'register' }, label: 'auth.createAccount' }
      : { to: { name: 'login' }, label: 'common.signIn' },
)

/** A made-up account for the panel's strip (labelled as a sample). */
const SAMPLE = [
  { n: 92, label: 'shell.nav.characters' },
  { n: 341, label: 'shell.nav.weapons' },
  { n: 1684, label: 'shell.nav.artifacts' },
]
</script>

<template>
  <div class="lp au-page" data-theme="dark">
    <header class="sky top">
      <nav class="wrap nav" :aria-label="$t('landing.nav.label')">
        <RouterLink :to="{ name: 'landing' }" class="brand">
          <span class="spark" aria-hidden="true">✦</span>Teyvat.me
        </RouterLink>
        <div class="nav-r">
          <button
            class="lang"
            type="button"
            aria-haspopup="dialog"
            :aria-label="`${$t('settings.appearance.language')}: ${languageName}`"
            :title="$t('settings.appearance.language')"
            @click="languageOpen = true"
          >
            <Globe class="ic" aria-hidden="true" />
            <span class="long">{{ languageName }}</span>
            <span class="short">{{ short }}</span>
          </button>
          <RouterLink :to="cta.to" class="btn btn-sm btn-g">{{ $t(cta.label) }}</RouterLink>
        </div>
      </nav>
    </header>

    <div class="au-split">
      <aside class="au-side">
        <p class="h1"><span class="spark" aria-hidden="true">✦</span> Teyvat.me</p>
        <p class="lead">{{ $t('landing.hero.lead') }}</p>
        <ul class="au-pts">
          <li>
            <span class="pi"><Power class="ic" aria-hidden="true" /></span>
            <span
              ><b>{{ $t('auth.side.capture') }}</b> {{ $t('auth.side.captureText') }}</span
            >
          </li>
          <li>
            <span class="pi"><TrendingUp class="ic" aria-hidden="true" /></span>
            <span
              ><b>{{ $t('auth.side.track') }}</b> {{ $t('auth.side.trackText') }}</span
            >
          </li>
          <li>
            <span class="pi"><ClipboardList class="ic" aria-hidden="true" /></span>
            <span
              ><b>{{ $t('auth.side.plan') }}</b> {{ $t('auth.side.planText') }}</span
            >
          </li>
        </ul>
        <div class="au-mini" :aria-label="$t('auth.side.sample')" :title="$t('auth.side.sample')">
          <div v-for="item in SAMPLE" :key="item.label">
            <b class="tab">{{ formatNumber(item.n) }}</b>
            <span>{{ $t(item.label) }}</span>
          </div>
        </div>
      </aside>

      <main class="au-formside">
        <div class="au-card">
          <div class="au-h">
            <h1>{{ title }}</h1>
            <p v-if="subtitle">{{ subtitle }}</p>
          </div>
          <div><slot /></div>
          <p v-if="$slots.footer" class="au-foot">
            <slot name="footer" />
          </p>
        </div>
      </main>
    </div>

    <UiModal
      :open="languageOpen"
      :title="$t('settings.appearance.language')"
      @close="languageOpen = false"
    >
      <AppearanceControls language-only />
    </UiModal>
  </div>
</template>
