import { defineStore } from 'pinia'
import { ref } from 'vue'
import router from '../router'

const API_URL = 'http://localhost:3000'

export const useAuthStore = defineStore('auth', () => {
  const token = ref(localStorage.getItem('accessToken') || null)
  const user = ref<{ username: string } | null>(null)

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

  const isTokenExpired = (t: string) => {
    try {
      const payload = JSON.parse(atob(t.split('.')[1]))
      return payload.exp * 1000 < Date.now()
    } catch {
      return true
    }
  }

  const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
    let isExpired = false
    if (token.value) {
      isExpired = isTokenExpired(token.value)
    }

    let res: Response | undefined

    if (!isExpired) {
      const headers = new Headers(options.headers || {})
      if (token.value) {
        headers.set('Authorization', `Bearer ${token.value}`)
      }
      try {
        res = await fetch(url, { ...options, headers })
      } catch (err) {
        throw err
      }
    }

    if (isExpired || (res && res.status === 401)) {
      const currentRefreshToken = localStorage.getItem('refreshToken')
      if (!currentRefreshToken) {
        logout()
        return res || new Response(null, { status: 401 })
      }

      let refreshRes
      try {
        refreshRes = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: currentRefreshToken })
        })
      } catch (e) {
        logout()
        return res || new Response(null, { status: 401 })
      }

      if (refreshRes && refreshRes.ok) {
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

    return res || new Response(null, { status: 401 })
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
