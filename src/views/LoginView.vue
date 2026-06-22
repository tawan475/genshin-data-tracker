<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const username = ref('')
const password = ref('')
const isLoading = ref(false)
const errorMsg = ref('')

const router = useRouter()
const authStore = useAuthStore()

const handleLogin = async () => {
  errorMsg.value = ''
  isLoading.value = true

  try {
    const response = await fetch(`${authStore.API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: username.value,
        password: password.value
      })
    })

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.message || 'Login failed')
    }

    authStore.setAuthData(data.data.accessToken, data.data.refreshToken, username.value)
    router.push('/')
  } catch (err: any) {
    errorMsg.value = err.message
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="flex-1 flex items-center justify-center p-6 relative z-10 opacity-0 animate-fade-up">
    <div class="glass-panel w-full max-w-md p-10 bg-slate-900/80">
      <div class="text-center mb-8">
        <h2 class="text-3xl font-bold mb-2">Welcome Back</h2>
        <p class="text-gray-400">Enter your details to access your dashboard.</p>
      </div>

      <div v-if="errorMsg" class="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-400 text-sm">
        {{ errorMsg }}
      </div>
      
      <form @submit.prevent="handleLogin" class="flex flex-col gap-5">
        <div class="flex flex-col gap-2">
          <label for="username" class="text-sm font-medium text-gray-400">Username</label>
          <input 
            type="text" 
            id="username" 
            v-model="username" 
            placeholder="Aether"
            class="bg-black/20 border border-white/10 text-white px-4 py-3.5 rounded-xl text-base focus:outline-none focus:border-paimon focus:bg-black/30 focus:shadow-[0_0_0_3px_var(--color-paimon-glow)] transition-all"
            required
          />
        </div>
        
        <div class="flex flex-col gap-2">
          <label for="password" class="text-sm font-medium text-gray-400">Password</label>
          <input 
            type="password" 
            id="password" 
            v-model="password" 
            placeholder="••••••••"
            class="bg-black/20 border border-white/10 text-white px-4 py-3.5 rounded-xl text-base focus:outline-none focus:border-paimon focus:bg-black/30 focus:shadow-[0_0_0_3px_var(--color-paimon-glow)] transition-all"
            required
          />
        </div>
        
        <div class="flex justify-end">
          <a href="#" class="text-paimon text-sm font-medium hover:drop-shadow-[0_0_8px_var(--color-paimon-glow)] transition-all">Forgot password?</a>
        </div>
        
        <button type="submit" class="btn-primary w-full mt-2 rounded-xl" :disabled="isLoading">
          <span v-if="!isLoading">Sign In</span>
          <span v-else class="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
        </button>
      </form>
      
      <div class="mt-8 text-center text-gray-400 text-sm">
        Don't have an account? 
        <router-link to="/register" class="text-paimon font-semibold hover:drop-shadow-[0_0_8px_var(--color-paimon-glow)] transition-all">Sign up</router-link>
      </div>
    </div>
  </div>
</template>
