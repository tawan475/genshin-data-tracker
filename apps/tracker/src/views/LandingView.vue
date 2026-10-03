<script setup lang="ts">
import { computed } from 'vue'
import {
  ArrowRight,
  ChartLine,
  Database,
  ExternalLink,
  FileArchive,
  MonitorSmartphone,
  Radio,
  ScanSearch,
  ShieldCheck,
  Upload,
  History,
} from 'lucide-vue-next'
import ProductPreview from '@/components/landing/ProductPreview.vue'
import UiButton from '@/components/ui/UiButton.vue'
import { useSession } from '@/stores/session'

/**
 * The public front page. The router guard has already resolved the session,
 * so a signed-in visitor gets "Open dashboard" instead of the sign-up pitch.
 */
const session = useSession()
const signedIn = computed(() => session.status === 'signed-in')

const IRMINSUL = 'https://github.com/tawan475/irminsul'

const steps = [
  {
    icon: Radio,
    title: 'Play with Irminsul running',
    body: 'Irminsul is a small desktop app. It reads the game’s network traffic while you play and picks out your inventory. Start it before the game.',
  },
  {
    icon: Upload,
    title: 'It uploads a snapshot',
    body: 'Irminsul uploads a GOOD snapshot to the tracker with your account’s import key. Turn on auto export and it happens every time you log in.',
  },
  {
    icon: History,
    title: 'The tracker keeps the history',
    body: 'Every snapshot is kept: artifacts, characters, weapons and materials over time. Export GOOD files whenever you need them.',
  },
]

const features = [
  {
    icon: ScanSearch,
    title: 'Artifact search with CV and RV',
    body: 'Search thousands of artifacts by set, slot and stats. Each one shows its crit value, roll value and how good every roll was.',
  },
  {
    icon: ChartLine,
    title: 'Materials over time',
    body: 'Pick any material and see its count across every snapshot, grouped by day, month or year.',
  },
  {
    icon: FileArchive,
    title: 'Snapshot history and export',
    body: 'Browse every capture with its totals. Download one snapshot as a GOOD file, or many at once as a zip.',
  },
  {
    icon: ShieldCheck,
    title: 'Your password stays on your device',
    body: 'It is stretched in your browser before anything is sent, so the server never sees it. Your data is yours: export all of it at any time.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Installable app',
    body: 'Add it to your home screen or desktop. The app shell loads offline; your data loads when you are back online.',
  },
]
</script>

<template>
  <div class="flex min-h-dvh flex-col">
    <header class="border-b border-border-subtle">
      <div
        class="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8"
      >
        <RouterLink
          :to="{ name: 'landing' }"
          class="inline-flex min-h-11 items-center font-display text-2xl font-bold tracking-tight"
        >
          GI<span class="text-accent-text">/</span>tracker
        </RouterLink>
        <nav aria-label="Account">
          <UiButton v-if="signedIn" variant="ghost" :to="{ name: 'home' }">Dashboard</UiButton>
          <UiButton v-else variant="ghost" :to="{ name: 'login' }">Sign in</UiButton>
        </nav>
      </div>
    </header>

    <main class="flex-1">
      <!-- Hero -->
      <section
        class="mx-auto w-full max-w-6xl px-4 pt-12 pb-16 sm:px-8 sm:pt-20 lg:pb-24"
        aria-labelledby="hero-title"
      >
        <div class="max-w-3xl">
          <p class="mb-4 text-sm font-semibold tracking-wide text-text-muted uppercase">
            Genshin Impact inventory tracker
          </p>
          <h1
            id="hero-title"
            class="font-display text-4xl font-bold tracking-tight text-balance sm:text-5xl lg:text-6xl"
          >
            Your Genshin inventory, saved every time you log in.
          </h1>
          <p class="mt-5 max-w-2xl text-lg text-pretty text-text-secondary">
            Irminsul captures your characters, weapons, artifacts and materials as you play; the
            tracker keeps every snapshot so you can search artifacts, watch materials grow and
            export GOOD files.
          </p>
          <div class="mt-8 flex flex-wrap gap-3">
            <UiButton v-if="signedIn" variant="primary" :to="{ name: 'home' }">
              Open dashboard
              <ArrowRight class="size-5" aria-hidden="true" />
            </UiButton>
            <template v-else>
              <UiButton variant="primary" :to="{ name: 'register' }">
                Create account
                <ArrowRight class="size-5" aria-hidden="true" />
              </UiButton>
              <UiButton :to="{ name: 'login' }">Sign in</UiButton>
            </template>
          </div>
        </div>

        <div class="mt-12 sm:mt-16">
          <ProductPreview />
        </div>
      </section>

      <!-- How it works -->
      <section class="border-t border-border-subtle" aria-labelledby="how-title">
        <div class="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8 lg:py-24">
          <p class="mb-2 text-sm font-semibold tracking-wide text-text-muted uppercase">
            How it works
          </p>
          <h2
            id="how-title"
            class="max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Play as usual. The history writes itself.
          </h2>

          <ol
            class="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border-default bg-border-default lg:grid-cols-3"
          >
            <li
              v-for="(step, index) in steps"
              :key="step.title"
              class="flex flex-col gap-3 bg-surface-raised p-6"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="tabular font-mono text-sm text-text-muted"> 0{{ index + 1 }} </span>
                <component :is="step.icon" class="size-5 text-text-secondary" aria-hidden="true" />
              </div>
              <h3 class="font-display text-xl font-bold">{{ step.title }}</h3>
              <p class="text-text-secondary">{{ step.body }}</p>
              <a
                v-if="index === 0"
                :href="IRMINSUL"
                target="_blank"
                rel="noopener noreferrer"
                class="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start font-medium text-accent-text hover:underline"
              >
                Get Irminsul on GitHub
                <ExternalLink class="size-4" aria-hidden="true" />
                <span class="sr-only">(opens in a new tab)</span>
              </a>
              <p v-else-if="index === 1" class="mt-auto text-sm text-text-muted">
                Using another scanner? Import its GOOD file by hand from the account’s Import page.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <!-- Features -->
      <section class="border-t border-border-subtle" aria-labelledby="features-title">
        <div class="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8 lg:py-24">
          <p class="mb-2 text-sm font-semibold tracking-wide text-text-muted uppercase">
            What you get
          </p>
          <h2
            id="features-title"
            class="max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Built for big inventories.
          </h2>

          <ul class="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <li
              v-for="feature in features"
              :key="feature.title"
              class="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-raised p-6"
            >
              <component :is="feature.icon" class="size-6 text-text-secondary" aria-hidden="true" />
              <h3 class="font-display text-xl font-bold">{{ feature.title }}</h3>
              <p class="text-text-secondary">{{ feature.body }}</p>
            </li>

            <li
              class="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-raised p-6"
            >
              <Database class="size-6 text-text-secondary" aria-hidden="true" />
              <h3 class="font-display text-xl font-bold">About 1 KB per snapshot</h3>
              <dl class="grid grid-cols-2 gap-4">
                <div>
                  <dt class="text-sm text-text-secondary">Uploaded</dt>
                  <dd class="tabular font-mono text-2xl font-medium text-text-secondary">
                    ~800 KB
                  </dd>
                </div>
                <div>
                  <dt class="text-sm text-text-secondary">Stored</dt>
                  <dd class="tabular font-mono text-2xl font-medium">~1 KB</dd>
                </div>
              </dl>
              <p class="text-text-secondary">
                Artifacts are stored once and unchanged items cost almost nothing, so years of daily
                snapshots stay small. Measured on 185 real snapshots.
              </p>
            </li>
          </ul>
        </div>
      </section>

      <!-- Closing call to action -->
      <section class="border-t border-border-subtle" aria-labelledby="start-title">
        <div class="mx-auto w-full max-w-6xl px-4 py-16 sm:px-8 lg:py-24">
          <div
            class="flex flex-col gap-6 rounded-2xl border border-border-default bg-surface-raised p-6 sm:p-10 lg:flex-row lg:items-center lg:justify-between"
          >
            <div class="max-w-2xl">
              <h2 id="start-title" class="font-display text-3xl font-bold tracking-tight">
                {{ signedIn ? 'Your snapshots are waiting.' : 'Start with your next login.' }}
              </h2>
              <p class="mt-3 text-text-secondary">
                Create an account, add your Genshin account to get its import key, then paste the
                key into Irminsul. The next time you log in, your first snapshot arrives.
              </p>
            </div>
            <div class="flex flex-wrap gap-3">
              <UiButton v-if="signedIn" variant="primary" :to="{ name: 'home' }">
                Open dashboard
              </UiButton>
              <template v-else>
                <UiButton variant="primary" :to="{ name: 'register' }">Create account</UiButton>
                <UiButton :to="{ name: 'login' }">Sign in</UiButton>
              </template>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="border-t border-border-subtle">
      <div
        class="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-text-muted sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-8"
      >
        <span class="font-display text-base font-bold text-text-primary"
          >GI<span class="text-accent-text">/</span>tracker</span
        >
        <a
          :href="IRMINSUL"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex min-h-11 items-center gap-1.5 self-start text-text-secondary hover:text-text-primary hover:underline sm:self-auto"
        >
          Irminsul on GitHub
          <ExternalLink class="size-4" aria-hidden="true" />
          <span class="sr-only">(opens in a new tab)</span>
        </a>
        <p>Not affiliated with HoYoverse.</p>
      </div>
    </footer>
  </div>
</template>
