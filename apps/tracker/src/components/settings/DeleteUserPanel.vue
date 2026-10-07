<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Trash2 } from 'lucide-vue-next'
import DeleteUserDialog from '@/components/staff/DeleteUserDialog.vue'
import UiButton from '@/components/ui/UiButton.vue'
import UiPanel from '@/components/ui/UiPanel.vue'
import { useAccounts } from '@/stores/accounts'
import { useFeedback } from '@/stores/feedback'
import { useSession } from '@/stores/session'

/**
 * Deletes the user and everything they own, after they type their
 * username: every Genshin account, snapshot, key and sign-in. Signs out.
 */
const session = useSession()
const accounts = useAccounts()
const feedback = useFeedback()
const router = useRouter()
const open = ref(false)
const busy = ref(false)

const me = computed(() =>
  session.me ? { id: session.me.id, username: session.me.username } : null,
)
const figures = computed(() => ({
  accounts: accounts.list.length,
  snapshots: accounts.list.reduce((n, a) => n + a.snapshotCount, 0),
  storedBytes: accounts.list.reduce((n, a) => n + a.storedBytes, 0),
}))

async function remove(username: string) {
  busy.value = true
  try {
    await session.deleteMe(username)
    accounts.clear()
    open.value = false
    feedback.toast({ tone: 'success', title: 'Your user is deleted' })
    await router.replace({ name: 'landing' })
  } catch (error) {
    feedback.error('Not deleted', error)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UiPanel title="Delete user">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-sm text-text-muted">Every account, snapshot and sign-in</p>
      <UiButton variant="danger" @click="open = true">
        <Trash2 class="size-4" aria-hidden="true" />
        Delete
      </UiButton>
    </div>
    <DeleteUserDialog
      :open="open"
      :user="me"
      :figures="figures"
      title="Delete my user"
      :busy="busy"
      @close="open = false"
      @confirm="remove"
    />
  </UiPanel>
</template>
