import axios from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('pharmax-auth')
      if (stored) {
        const { state } = JSON.parse(stored)
        if (state?.accessToken) {
          config.headers.Authorization = `Bearer ${state.accessToken}`
        }
      }
    } catch {}
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const url = err.config?.url || ''
    const isAuthCall = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/token/refresh')

    if (err.response?.status === 401 && !isAuthCall) {
      try {
        const stored = localStorage.getItem('pharmax-auth')
        if (stored) {
          const { state } = JSON.parse(stored)
          if (state?.refreshToken) {
            const resp = await axios.post(
              `${process.env.NEXT_PUBLIC_API_URL}/auth/token/refresh/`,
              { refresh: state.refreshToken }
            )
            const newAccess = resp.data.access
            const parsed = JSON.parse(localStorage.getItem('pharmax-auth') || '{}')
            parsed.state.accessToken = newAccess
            localStorage.setItem('pharmax-auth', JSON.stringify(parsed))
            err.config.headers.Authorization = `Bearer ${newAccess}`
            return api(err.config)
          }
        }
      } catch {}
      if (typeof window !== 'undefined') {
        localStorage.removeItem('pharmax-auth')
        window.location.href = '/signin'
      }
    }

    // Retry transient failures on idempotent GETs. The free-tier backend (Render worker +
    // Neon) intermittently returns 5xx / drops the connection; without this a single blip
    // blanks a page ("Failed to load..."). Only GETs are retried, so no double-writes.
    const cfg = err.config as (InternalAxiosRequestConfig & { _retryCount?: number }) | undefined
    const method = (cfg?.method || 'get').toLowerCase()
    const status = err.response?.status ?? 0
    const isTransient = !err.response || (status >= 500 && status <= 599)
    if (cfg && method === 'get' && isTransient) {
      const count = cfg._retryCount ?? 0
      if (count < 2) {
        cfg._retryCount = count + 1
        await new Promise((resolve) => setTimeout(resolve, 400 * (count + 1)))
        return api(cfg)
      }
    }

    return Promise.reject(err)
  }
)

export default api
