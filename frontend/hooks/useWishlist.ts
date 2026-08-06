import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'

export function useWishlist() {
  const [wishlistIds, setWishlistIds] = useState<string[]>([])
  const user = useAuthStore((s) => s.user)

  const fetchWishlist = useCallback(async () => {
    if (!user) return
    try {
      const res = await api.get('/wishlist/')
      const items = res.data.data.wishlist || []
      setWishlistIds(items.map((m: any) => m.id))
    } catch {}
  }, [user])

  useEffect(() => { fetchWishlist() }, [fetchWishlist])

  const toggle = async (medicineId: string) => {
    const inWishlist = wishlistIds.includes(medicineId)
    setWishlistIds((prev) => inWishlist ? prev.filter((id) => id !== medicineId) : [...prev, medicineId])
    try {
      if (inWishlist) {
        await api.delete(`/wishlist/${medicineId}/`)
      } else {
        await api.post(`/wishlist/${medicineId}/`)
      }
    } catch {
      setWishlistIds((prev) => inWishlist ? [...prev, medicineId] : prev.filter((id) => id !== medicineId))
    }
  }

  return { wishlistIds, toggle, fetchWishlist }
}
