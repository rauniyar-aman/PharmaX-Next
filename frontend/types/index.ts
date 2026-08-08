export interface User {
  id: string
  full_name: string
  email: string
  phone?: string | null
  role: 'CUSTOMER' | 'ADMIN' | 'PHARMACY' | 'DELIVERY_AGENT'
  is_email_verified: boolean
  avatar_url?: string | null
  referral_code?: string | null
  is_super_admin?: boolean
  permission_codes?: string[]   // only present when role === 'ADMIN'
  delivery_agent_verified?: boolean | null   // only present when role === 'DELIVERY_AGENT'
  created_at: string
  updated_at: string
}

export interface Permission {
  id: string
  code: string
  label: string
  group: string
}

export interface AdminUser {
  id: string
  full_name: string
  email: string
  phone: string
  is_active: boolean
  is_super_admin: boolean
  permission_codes: string[]
  created_at: string
}

export interface AdminPharmacy {
  id: string
  name: string
  email: string
  license_number: string
  phone: string
  address: string
  lat: number
  lng: number
  is_verified: boolean
  is_active: boolean
  user_is_active: boolean
  created_at: string
}

export interface AdminDeliveryAgent {
  id: string
  full_name: string
  email: string
  phone: string
  vehicle_type: string | null
  lat: number | null
  lng: number | null
  is_verified: boolean
  is_online: boolean
  user_is_active: boolean
  outstanding_cod_balance: string
  created_at: string
}

export interface PharmacyListing {
  id: string
  medicine_id: string
  medicine_name: string
  medicine_image_url: string | null
  medicine_price: string
  stock_quantity: number
  expiry_date: string
  is_available: boolean
  updated_at: string
}

export interface PharmacyFulfillmentRequest {
  id: string
  order_id: string
  medicine_id: string
  medicine_name: string
  medicine_image_url: string | null
  quantity: number
  city: string | null
  province: string | null
  status: string
  created_at: string
}

export interface PharmacyOrderFulfillmentItem {
  medicine_id: string
  medicine_name: string
  quantity: number
  unit_price: string
}

export interface PharmacyOrderFulfillment {
  id: string
  order_id: string
  order_placed_at: string
  status: string
  items: PharmacyOrderFulfillmentItem[]
  delivery_agent_name: string | null
  city: string | null
  accepted_at: string | null
  delivered_at: string | null
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

export interface Brand {
  id: string
  name: string
  manufacturer?: string | null
  logo_url?: string | null
  description?: string | null
  is_active: boolean
  medicine_count?: number
  created_at: string
}

export interface Medicine {
  id: string
  name: string
  brand: Brand
  brand_name?: string
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
  | 'BROADCASTING'
  | 'AWAITING_PAYMENT'
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
  discount?: string
  coupon_code?: string | null
  wallet_used?: string
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

export interface FulfillmentSummaryItem {
  order_item_id: string
  medicine_id: string
  medicine_name: string
  quantity: number
  unit_price: string
}

export interface FulfillmentSummary {
  order_status: OrderStatus
  accepted_items: FulfillmentSummaryItem[]
  unfulfilled_items: FulfillmentSummaryItem[]
  pending_items: FulfillmentSummaryItem[]
  all_resolved: boolean
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

export interface DoctorReview {
  id: string
  user?: { id: string; full_name: string } | null
  doctor?: Doctor
  rating: number
  comment?: string | null
  created_at: string
  is_mine?: boolean
}

export type HealthRecordType = 'PRESCRIPTION' | 'LAB_REPORT' | 'VACCINATION' | 'DISCHARGE_SUMMARY' | 'OTHER'

export interface HealthRecord {
  id: string
  title: string
  record_type: HealthRecordType
  file_url?: string | null
  notes?: string | null
  record_date?: string | null
  uploaded_at: string
}

export type ReminderFrequency = 'DAILY' | 'WEEKLY' | 'AS_NEEDED'

export interface MedicineReminder {
  id: string
  medicine_name: string
  dosage?: string | null
  times: string
  frequency: ReminderFrequency
  start_date: string
  end_date?: string | null
  notes?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ReminderScheduleItem {
  reminder_id: string
  medicine_name: string
  dosage?: string | null
  time: string
  taken: boolean
}

export interface LabTestCategory {
  id: string
  name: string
  icon?: string | null
  is_active: boolean
  test_count?: number
  created_at: string
}

export type SampleType = 'BLOOD' | 'URINE' | 'SWAB' | 'OTHER'

export interface LabTest {
  id: string
  name: string
  category: LabTestCategory
  category_name?: string
  description?: string | null
  parameters_included?: string | null
  sample_type: SampleType
  fasting_required: boolean
  reporting_time?: string | null
  is_package: boolean
  price: string
  original_price: string
  is_active: boolean
  total_bookings: number
  created_at: string
  updated_at: string
}

export type LabTestBookingStatus = 'PENDING' | 'CONFIRMED' | 'SAMPLE_COLLECTED' | 'REPORT_READY' | 'CANCELLED'

export interface LabTestBooking {
  id: string
  user?: { id: string; full_name: string; email: string; phone?: string | null }
  lab_test: LabTest
  address?: Address | null
  scheduled_date: string
  time_slot: string
  status: LabTestBookingStatus
  total_amount: string
  notes?: string | null
  report_url?: string | null
  booked_at: string
  updated_at: string
}

export interface MedicineSubscription {
  id: string
  user?: { id: string; full_name: string; email: string }
  medicine: Medicine
  address?: Address | null
  quantity: number
  frequency_days: number
  is_active: boolean
  next_delivery_date: string
  last_delivered_at?: string | null
  created_at: string
  updated_at: string
}

export interface Doctor {
  id: string
  name: string
  specialty: string
  qualification?: string | null
  experience_years: number
  consultation_fee: string
  photo_url?: string | null
  bio?: string | null
  languages?: string | null
  is_active: boolean
  rating: string
  total_reviews: number
  total_consultations: number
  created_at: string
  updated_at: string
}

export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'

export interface DoctorAppointment {
  id: string
  user?: { id: string; full_name: string; email: string; phone?: string | null }
  doctor: Doctor
  scheduled_date: string
  time_slot: string
  status: AppointmentStatus
  fee_amount: string
  reason?: string | null
  meeting_link?: string | null
  booked_at: string
  updated_at: string
}

export interface PlusPlan {
  id: string
  name: string
  duration_days: number
  price: string
  description?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface PlusMembership {
  id: string
  user?: { id: string; full_name: string; email: string }
  plan: PlusPlan
  started_at: string
  expires_at: string
  price_paid: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface BlogPost {
  id: string
  title: string
  slug: string
  category?: string | null
  cover_image_url?: string | null
  excerpt?: string | null
  content: string
  author: string
  is_published: boolean
  published_at?: string | null
  created_at?: string
  updated_at?: string
}

export type DiscountType = 'PERCENTAGE' | 'FLAT'

export interface Coupon {
  id: string
  code: string
  description?: string | null
  discount_type: DiscountType
  discount_value: string
  min_order_amount: string
  max_discount_amount?: string | null
  usage_limit?: number | null
  per_user_limit: number
  valid_from: string
  valid_until: string
  is_active: boolean
  times_used?: number
  created_at: string
  updated_at: string
}

export type WalletTransactionType = 'CREDIT' | 'DEBIT'

export interface WalletTransaction {
  id: string
  type: WalletTransactionType
  amount: string
  reason: string
  balance_after: string
  order?: string | null
  created_at: string
}

export interface Wallet {
  id: string
  balance: string
  updated_at: string
  transactions: WalletTransaction[]
}

export type ReferralStatus = 'PENDING' | 'REWARDED'

export interface Referral {
  id: string
  referred_user: { full_name: string; email: string }
  status: ReferralStatus
  reward_amount?: string | null
  created_at: string
  rewarded_at?: string | null
}

export interface DeliveryFulfillmentItem {
  medicine_name: string
  quantity: number
}

export interface DeliveryFulfillment {
  id: string
  order_id: string
  pharmacy_name: string
  pharmacy_address: string
  pharmacy_lat: number
  pharmacy_lng: number
  city: string | null
  items: DeliveryFulfillmentItem[]
  delivery_broadcast_at: string | null
}

export interface DeliveryActiveFulfillment {
  id: string
  order_id: string
  status: string
  pharmacy_name: string
  pharmacy_address: string
  pharmacy_lat: number
  pharmacy_lng: number
  customer_name: string | null
  customer_phone: string | null
  delivery_address: string | null
  delivery_lat: number | null
  delivery_lng: number | null
  payment_method: string | null
  items: DeliveryFulfillmentItem[]
  accepted_at: string | null
}

export type PayoutStatus = 'PENDING' | 'PAID'
export type CodLiabilityStatus = 'PENDING' | 'REMITTED'
export type FundingSource = 'ORDER_REVENUE' | 'PLATFORM_FUNDS'
export type RemittanceMethod = 'CASH_DEPOSIT' | 'GATEWAY_TOPUP'

export interface PharmacyPayout {
  id: string
  pharmacy: string
  pharmacy_name: string
  fulfillment: string
  order_id: string
  gross_amount: string
  commission_rate: string
  commission_amount: string
  net_payable: string
  funding_source: FundingSource
  status: PayoutStatus
  paid_at: string | null
  paid_by_name: string | null
  created_at: string
}

export interface DeliveryAgentEarning {
  id: string
  agent: string
  agent_name: string
  fulfillment: string
  order_id: string
  amount: string
  status: PayoutStatus
  paid_at: string | null
  paid_by_name: string | null
  created_at: string
}

export interface DeliveryAgentCodLiability {
  id: string
  agent: string
  agent_name: string
  fulfillment: string
  order_id: string
  amount_collected: string
  status: CodLiabilityStatus
  remittance_method: RemittanceMethod | null
  reference: string | null
  remitted_at: string | null
  confirmed_by_name: string | null
  days_outstanding: number | null
  created_at: string
}

export interface AgentFinanceProfile {
  agent: AdminDeliveryAgent
  cod_record: {
    liabilities: DeliveryAgentCodLiability[]
    total_collected: string
    total_outstanding: string
    oldest_unremitted_age_days: number | null
  }
  earnings_record: {
    earnings: DeliveryAgentEarning[]
    total_earned: string
    total_pending: string
    total_paid: string
  }
}

export interface FinanceSummary {
  total_commission_earned: string
  pending_pharmacy_payouts: { order_revenue: string; platform_funds: string }
  pending_agent_earnings: string
  outstanding_cod: { total: string; by_agent: { agent_id: string; agent_name: string; amount: string }[] }
  coupon_cost_this_month: string
}
