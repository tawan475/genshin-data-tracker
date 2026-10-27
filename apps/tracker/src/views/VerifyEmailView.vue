<script setup lang="ts">
import { linkToken } from '@gdt/shared'
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { CircleCheck } from 'lucide-vue-next'
import LinkProblem from '@/components/public/LinkProblem.vue'
import { linkProblem, type LinkProblem as Problem } from '@/components/public/link-problem'
import UiSpinner from '@/components/ui/UiSpinner.vue'
import { ApiRequestError, api } from '@/api'
import { t } from '@/i18n'
import { useSession } from '@/stores/session'
import AuthFrame from './AuthFrame.vue'

/** `/verify-email?token=…` from a confirmation email: confirms on arrival, in any browser. */
const route = useRoute()
const session = useSession()

const email = ref<string | null>(null)
const problem = ref<Problem | null>(null)

onMounted(async () => {
  const token = typeof route.query.token === 'string' ? route.query.token : ''
  const [result] = await Promise.allSettled([
    linkToken.safeParse(token).success
      ? api.verifyEmail(token)
      : Promise.reject(new ApiRequestError(400, 'token_invalid', '')),
    session.ensureLoaded(),
  ])
  if (result.status === 'fulfilled') {
    email.value = result.value.email
    session.emailConfirmed(result.value.email)
  } else if (linkProblem(result.reason).kind === 'used' && session.me?.emailVerified) {
    // Opened twice: the email is confirmed, which is all the reader wants to know.
    email.value = session.me.email
  } else {
    problem.value = linkProblem(result.reason)
  }
})

const title = computed(() =>
  problem.value
    ? problem.value.title
    : email.value
      ? t('auth.verify.confirmed')
      : t('auth.verify.title'),
)
const signedIn = computed(() => session.status === 'signed-in')
</script>

<template>
  <AuthFrame :title="title">
    <LinkProblem
      v-if="problem"
      :problem="problem"
      :retry="{ name: 'settings' }"
      :retry-label="$t('auth.verify.sendNew')"
    />
    <div v-else-if="email" class="flex flex-col items-center gap-6 text-center" role="status">
      <CircleCheck class="size-10 text-emerald-400" aria-hidden="true" />
      <p class="break-all text-gray-200">{{ email }}</p>
      <RouterLink
        :to="signedIn ? { name: 'settings' } : { name: 'login' }"
        class="btn-glow w-full rounded-xl"
      >
        {{ signedIn ? $t('common.continue') : $t('common.signIn') }}
      </RouterLink>
    </div>
    <div v-else class="flex justify-center py-6" aria-busy="true">
      <UiSpinner class="size-6 text-accent-text" />
    </div>
  </AuthFrame>
</template>
