import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const API_URL = 'http://localhost:3000'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('accessToken') || null)
  const user = ref<{ username: string } | null>(null)
  const router = useRouter()

  const setAuthData = (accessToken: string, refreshToken: string, username?: string) => {
    token.value = accessToken
    localStorage.setItem('accessToken', accessToken)
    localStorage.setItem('refreshToken', refreshToken)
    if (username) {
      user.value = { username }
      localStorage.setItem('username', username)
    }
  }

  const logout = () => {
    token.value = null
    user.value = null
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('username')
    router.push('/login')
  }

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {})
    if (token.value) {
      headers.set('Authorization', `Bearer ${token.value}`)
    }

    let res = await fetch(url, {
      ...options,
      headers
    })

    if (res.status === 401) {
      const currentRefreshToken = localStorage.getItem('refreshToken')
      if (!currentRefreshToken) {
        logout()
        return res
      }

      const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: currentRefreshToken })
      })

      if (refreshRes.ok) {
        const data = await refreshRes.json()
        setAuthData(data.data.accessToken, data.data.refreshToken, user.value?.username)
        
        // Retry original request
        const retryHeaders = new Headers(options.headers || {})
        retryHeaders.set('Authorization', `Bearer ${token.value}`)
        
        res = await fetch(url, {
          ...options,
          headers: retryHeaders
        })
      } else {
        logout()
      }
    }

    return res
  }

  // Load user from local storage on init
  const savedUsername = localStorage.getItem('username')
  if (savedUsername) {
    user.value = { username: savedUsername }
  }

  return {
    token,
    user,
    setAuthData,
    logout,
    fetchWithAuth,
    API_URL
  }
})
