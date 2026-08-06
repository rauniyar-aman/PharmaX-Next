export interface User {
  id: string
  full_name: string
  email: string
  phone?: string | null
  role: 'CUSTOMER' | 'ADMIN'
  is_email_verified: boolean
  avatar_url?: string | null
  created_at: string
  updated_at: string
}

export interface AuthTokens {
  access: string
  refresh: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface Category {
  id: string
  name: string
  description?: string | null
  icon?: string | null
  is_active: boolean
  medicine_count?: number
  created_at: string
}

export interface Medicine {
  id: string
  name: string
  brand: string
  generic_name?: string | null
  description?: string | null
  side_effects?: string | null
  storage_info?: string | null
  dosage_form?: string | null
  strength?: string | null
  price: string
  original_price: string
  type: 'Rx' | 'OTC'
  in_stock: boolean
  manufacturer?: string | null
  image_url?: string | null
  stock_quantity: number
  rating: string
  total_reviews: number
  category: Category
  category_name?: string
  created_at: string
  updated_at: string
}

export interface Address {
  id: string
  label?: string
  full_name: string
  phone: string
  address_line1: string
  address_line2?: string | null
  city: string
  state: string
  zip_code?: string | null
  lat?: number | null
  lng?: number | null
  is_default: boolean
}

export type OrderStatus =
  | 'PLACED'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED'

export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
export type PrescriptionStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED'

export interface OrderItem {
  id: string
  medicine: Medicine
  quantity: number
  unit_price: string
}

export interface Order {
  id: string
  user?: { id: string; full_name: string; email: string; phone?: string | null }
  status: OrderStatus
  total_amount: string
  delivery_charge?: string
  payment_method?: string | null
  payment_status: PaymentStatus
  notes?: string | null
  order_rating?: number | null
  order_comment?: string | null
  placed_at: string
  updated_at: string
  items: OrderItem[]
  shipping_address?: Address | null
}

export interface Prescription {
  id: string
  file_name?: string
  file_url?: string | null
  notes?: string | null
  doctor?: string | null
  hospital?: string | null
  rejection_reason?: string | null
  status: PrescriptionStatus
  uploaded_at: string
}

export interface SystemSettings {
  [key: string]: string
}

export interface Review {
  id: string
  user?: { id: string; full_name: string } | null
  rating: number
  comment?: string | null
  created_at: string
  is_mine?: boolean
  mine?: boolean
}

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  is_read: boolean
  link?: string | null
  created_at: string
}
