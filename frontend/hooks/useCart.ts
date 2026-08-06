import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { useCartStore } from '@/store/cart'
import { useAuthStore } from '@/store/auth'
import type { Medicine } from '@/types'

interface CartItem {
  id: string
  medicine: Medicine
  quantity: number
}

interface Cart {
  id: string
  items: CartItem[]
}

export function useCart() {
  const [cart, setCart] = useState<Cart | null>(null)
  const [loading, setLoading] = useState(false)
  const setCount = useCartStore((s) => s.setCount)
  const user = useAuthStore((s) => s.user)

  const fetchCart = useCallback(async () => {
    if (!user) return
    try {
      const res = await api.get('/cart/')
      const c = res.data.data.cart
      setCart(c)
      setCount(c?.items?.length || 0)
    } catch {}
  }, [user, setCount])

  useEffect(() => { fetchCart() }, [fetchCart])

  const addToCart = async (medicineId: string, quantity = 1) => {
    setLoading(true)
    try {
      const res = await api.post('/cart/items/', { medicineId, quantity })
      const c = res.data.data.cart
      setCart(c)
      setCount(c?.items?.length || 0)
      return true
    } catch (err: any) {
      throw err
    } finally {
      setLoading(false)
    }
  }

  const updateItem = async (itemId: string, quantity: number) => {
    try {
      const res = await api.put(`/cart/items/${itemId}/`, { quantity })
      const c = res.data.data.cart
      setCart(c)
      setCount(c?.items?.length || 0)
    } catch (err: any) { throw err }
  }

  const removeItem = async (itemId: string) => {
    try {
      const res = await api.delete(`/cart/items/${itemId}/`)
      const c = res.data.data.cart
      setCart(c)
      setCount(c?.items?.length || 0)
    } catch (err: any) { throw err }
  }

  const clearCart = async () => {
    try {
      await api.delete('/cart/')
      setCart(null)
      setCount(0)
    } catch {}
  }

  const total = cart?.items.reduce((sum, item) => sum + Number(item.medicine.price) * item.quantity, 0) || 0

  return { cart, loading, fetchCart, addToCart, updateItem, removeItem, clearCart, total }
}
