import axios from 'axios'

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
    return Promise.reject(err)
  }
)

export default api
