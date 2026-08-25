export interface User {
  id: string
  full_name: string
  email: string
  phone?: string | null
  role: 'CUSTOMER' | 'ADMIN' | 'PHARMACY' | 'DELIVERY_AGENT' | 'DOCTOR' | 'LAB_COLLECTOR'
  is_email_verified: boolean
  avatar_url?: string | null
  referral_code?: string | null
  is_super_admin?: boolean
  permission_codes?: string[]   // only present when role === 'ADMIN'
  delivery_agent_verified?: boolean | null   // only present when role === 'DELIVERY_AGENT'
  delivery_agent_online?: boolean | null     // only present when role === 'DELIVERY_AGENT'
  doctor_verified?: boolean | null           // only present when role === 'DOCTOR'
  lab_collector_verified?: boolean | null    // only present when role === 'LAB_COLLECTOR'
  lab_collector_online?: boolean | null      // only present when role === 'LAB_COLLECTOR'
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
  logo_url: string | null
  is_verified: boolean
  is_active: boolean
  user_is_active: boolean
  created_at: string
  contact_person_name: string | null
  contact_person_phone: string | null
  bank_name: string | null
  bank_account_holder_name: string | null
  bank_account_number: string | null
  bank_branch: string | null
}

export interface PharmacyDocument {
  id: string
  doc_type: 'PAN_CARD' | 'CITIZENSHIP' | 'MOU' | 'CANCELLED_CHEQUE'
  doc_type_label: string
  file_url: string
  uploaded_by_name: string | null
  uploaded_at: string
}

export interface PharmacyLocationChangeRequest {
  id: string
  requested_lat: number
  requested_lng: number
  requested_address: string | null
  reason: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  admin_note: string | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  created_at: string
}

export interface AdminPharmacyDetail extends AdminPharmacy {
  documents: PharmacyDocument[]
  location_change_requests: PharmacyLocationChangeRequest[]
  listings_count: number
  request_stats: { accepted: number; declined: number; expired: number; pending: number }
  finance: { total_earned: string; total_commission: string; total_paid: string; total_pending: string }
  campaign_enrollments: PharmacyCampaignEnrollment[]
}

export type CampaignType = 'DISCOUNT' | 'BONUS'

export interface PharmacyIncentiveCampaign {
  id: string
  name: string
  description?: string | null
  campaign_type: CampaignType
  discounted_commission_rate?: string | null
  bonus_amount?: string | null
  starts_at: string
  ends_at: string
  is_active: boolean
  created_by_name?: string | null
  created_at: string
}

export type CampaignEnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED'

export interface PharmacyCampaignEnrollment {
  id: string
  campaign: PharmacyIncentiveCampaign
  pharmacy?: string
  pharmacy_name?: string
  status: CampaignEnrollmentStatus
  bonus_paid: boolean
  bonus_paid_at?: string | null
  enrolled_at: string
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

export interface AdminLabCollector {
  id: string
  full_name: string
  email: string
  phone: string
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
  order_status: string
  status: string
  items: PharmacyOrderFulfillmentItem[]
  delivery_agent_name: string | null
  city: string | null
  destination_lat: number | null
  destination_lng: number | null
  accepted_at: string | null
  delivered_at: string | null
  payment_status: 'NOT_APPLICABLE' | 'PENDING' | 'PAID' | 'HIDDEN'
  payout_amount: string | null
  payout_paid_at: string | null
  payout_gross_amount: string | null
  payout_commission_amount: string | null
  prescription_ready: boolean
  // Whether the rider's pickup code has been verified — never the code itself, which the
  // pharmacy has to actually collect from the rider in person, not read off this dashboard.
  pickup_verified_at: string | null
}

export interface DeliveryAgentEarning {
  id: string
  fulfillment: string
  order_id: string
  amount: string
  status: 'PENDING' | 'PAID'
  paid_at: string | null
  paid_by_name: string | null
  created_at: string
}

export interface DeliveryAgentCodLiability {
  id: string
  fulfillment: string
  order_id: string
  amount_collected: string
  status: 'PENDING' | 'REMITTED'
  remittance_method: 'CASH_DEPOSIT' | 'GATEWAY_TOPUP' | null
  reference: string | null
  remitted_at: string | null
  confirmed_by_name: string | null
  days_outstanding: number | null
  created_at: string
}

export interface DeliveryFinanceProfile {
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

export interface PharmacyProfile {
  id: string
  name: string
  license_number: string
  phone: string
  address: string
  lat: number
  lng: number
  logo_url: string | null
  is_verified: boolean
  is_active: boolean
  created_at: string
  contact_person_name: string | null
  contact_person_phone: string | null
  bank_name: string | null
  bank_account_holder_name: string | null
  bank_account_number: string | null
  bank_branch: string | null
  is_owner?: boolean
}

export interface PharmacyBusinessHoursDay {
  weekday: number
  weekday_label: string
  is_closed: boolean
  open_time: string | null
  close_time: string | null
}

export interface PharmacyTeamMember {
  id: string
  full_name: string
  email: string
  phone: string
  is_active: boolean
  can_view_finance: boolean
  created_at: string
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
  has_purchased?: boolean
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
  | 'AWAITING_PRESCRIPTION'
  | 'PRESCRIPTION_REJECTED'
  | 'BROADCASTING'
  | 'AWAITING_PAYMENT'
  | 'NO_PHARMACY_FOUND'
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
  prescription?: {
    id: string
    status: PrescriptionStatus
    file_name: string
    file_url: string | null
    rejection_reason: string | null
  } | null
}

export interface OrderFulfillmentProgress {
  id: string
  pharmacy_name: string | null
  status: string
  items: { medicine_name: string; quantity: number }[]
  delivery_agent_name: string | null
  accepted_at: string | null
  delivery_broadcast_at: string | null
  delivered_at: string | null
  rider_rating: number | null
  rider_rating_comment: string | null
  prescription_ready: boolean
}

// Matches matching._tracking_payload() — GET /orders/<id>/tracking/,
// /pharmacy/orders/<id>/tracking/, /admin/orders/<id>/tracking/ all return this same shape,
// one entry per OrderFulfillment on the order (a split order has more than one).
export interface TrackingAgent {
  name: string
  phone: string
  lat: number | null
  lng: number | null
  rating: number | null
  rating_count: number
}

export interface TrackingFulfillment {
  fulfillment_id: string
  status: string
  pharmacy_name: string | null
  agent: TrackingAgent | null
  assigned_agent_name: string | null
  distance_km?: number
  eta_minutes?: number
  // False if this leg has an Rx item whose prescription isn't yet verified — a fulfillment
  // sitting at ACCEPTED looks identical whether it's genuinely being prepped or just blocked by
  // pharmacy_advance_fulfillment()'s gate, so callers use this to avoid the misleading "Preparing"
  // label when nothing can actually be prepared yet.
  prescription_ready: boolean
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
  fulfillments?: OrderFulfillmentProgress[]
  // Rolled up from every Rx item's prescription: null if the order has none, VERIFIED once every
  // Rx item's prescription is admin-verified, REJECTED if any is missing/rejected, else PENDING.
  // Searching for a pharmacy proceeds regardless — a pharmacy just can't start preparing an item
  // until this is VERIFIED (see pharmacy_advance_fulfillment() on the backend).
  prescription_status?: 'PENDING' | 'VERIFIED' | 'REJECTED' | null
}

// GET /admin/orders/<id>/ — Order.user is just an id/name/email/phone stub (see above); this
// separate `customer` field carries the fuller admin-only UserProfileSerializer shape.
export interface FulfillmentRequestSummary {
  id: string
  pharmacy_name: string
  medicine_name: string
  quantity: number
  status: string
  created_at: string
  responded_at: string | null
}

export interface AdminOrderDetail extends Order {
  customer: User
  fulfillments: OrderFulfillmentProgress[]
  fulfillment_requests: FulfillmentRequestSummary[]
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

export type PrescriptionSource = 'UPLOAD' | 'CONSULTATION'

export interface Prescription {
  id: string
  file_name?: string
  file_url?: string | null
  notes?: string | null
  doctor?: string | null
  hospital?: string | null
  rejection_reason?: string | null
  admin_comment?: string | null
  status: PrescriptionStatus
  uploaded_at: string
  medicines_reviewed_at?: string | null
  medicine_item_count?: number
  lab_test_item_count?: number
  lab_test_pending_count?: number
  all_files?: { id: string | null; file_name: string; file_url: string }[]
  order?: { id: string; status: string; placed_at: string } | null
  source?: PrescriptionSource
  appointment_id?: string | null
  appointment_date?: string | null
}

export interface PrescriptionMedicineItem {
  id: string
  medicine: Medicine
  quantity: number
  created_at: string
}

export interface PrescriptionLabTestItem {
  id: string
  lab_test: LabTest
  booking_id: string | null
  created_at: string
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

export type ReminderFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'AS_NEEDED'

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

export type LabTestPaymentStatus = 'PENDING' | 'PAID'
export type LabTestPaymentMethod = 'KHALTI' | 'ESEWA' | 'CASH_ON_DELIVERY'

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
  payment_status?: LabTestPaymentStatus
  payment_method?: LabTestPaymentMethod | null
  collector?: { id: string; full_name: string; phone?: string | null } | null
  report_url?: string | null
  report_file_url?: string | null
  report_uploaded_at?: string | null
  booked_at: string
  updated_at: string
}

export interface CollectorEarning {
  id: string
  collector: string
  collector_name: string
  booking_id: string
  lab_test_name: string
  amount: string
  status: 'PENDING' | 'PAID'
  paid_at: string | null
  created_at: string
}

export interface CollectorCodLiability {
  id: string
  collector: string
  collector_name: string
  booking_id: string
  lab_test_name: string
  amount_collected: string
  status: 'PENDING' | 'REMITTED'
  remittance_method?: 'CASH_DEPOSIT' | 'GATEWAY_TOPUP' | null
  reference?: string | null
  remitted_at: string | null
  days_outstanding: number | null
  created_at: string
}

export interface CollectorFinanceProfile {
  cod_record: {
    liabilities: CollectorCodLiability[]
    total_collected: string
    total_outstanding: string
    oldest_unremitted_age_days: number | null
  }
  earnings_record: {
    earnings: CollectorEarning[]
    total_earned: string
    total_pending: string
    total_paid: string
  }
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
  // Present on AdminDoctorSerializer / DoctorProfileView responses (admin + doctor-self views),
  // absent from the public DoctorSerializer used by the patient-facing catalog.
  email?: string | null
  user_is_active?: boolean | null
  license_number?: string | null
  is_verified?: boolean
  onboarding_fee_amount?: string
  onboarding_fee_paid?: boolean
  onboarding_fee_paid_at?: string | null
  created_at: string
  updated_at: string
}

export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED'
export type AppointmentPaymentStatus = 'PENDING' | 'PAID' | 'NOT_REQUIRED'

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
  fee_charged?: string
  is_plus_free?: boolean
  payment_status?: AppointmentPaymentStatus
  payment_method?: 'KHALTI' | 'ESEWA' | 'WALLET' | null
  payout_status?: PayoutStatus | null   // admin views only (AdminAppointmentListView/Detail)
  prescription?: { id: string; notes: string | null; medicine_item_count: number; lab_test_item_count: number } | null
  follow_up_date?: string | null
  follow_up_notes?: string | null
  booked_at: string
  updated_at: string
}

export interface DoctorPatientSummary {
  user_id: string
  full_name: string
  email: string
  phone: string | null
  appointment_count: number
  last_visit: string
  follow_up_date: string | null
  days_until_follow_up: number | null
}

export interface DoctorPatientDetail {
  patient: { id: string; full_name: string; email: string; phone: string | null }
  appointments: DoctorAppointment[]
  prescriptions: (Prescription & { medicine_items: PrescriptionMedicineItem[]; lab_test_items: PrescriptionLabTestItem[] })[]
}

export interface DoctorAvailability {
  id: string
  day_of_week: number   // 0=Monday..6=Sunday
  start_time: string
  end_time: string
  slot_duration_minutes: number
  is_active: boolean
}

export interface DoctorPayout {
  id: string
  appointment: string
  patient_name?: string       // DoctorPayoutSerializer (self-service)
  doctor?: string              // AdminDoctorPayoutSerializer
  doctor_name?: string         // AdminDoctorPayoutSerializer
  appointment_date: string
  gross_amount: string
  commission_rate: string
  commission_amount: string
  net_payable: string
  status: PayoutStatus
  paid_at: string | null
  paid_by_name?: string | null
  created_at: string
}

export interface PlusBenefit {
  id: string
  plan?: string
  key: string
  description: string
  is_active: boolean
  created_at: string
}

export interface PlusPlan {
  id: string
  name: string
  duration_days: number
  price: string
  description?: string | null
  is_active: boolean
  benefits?: PlusBenefit[]
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

export type FeaturedDealTargetType = 'MEDICINE' | 'DOCTOR' | 'LAB_TEST' | 'PLUS_PLAN'

export interface FeaturedDeal {
  id: string
  target_type: FeaturedDealTargetType
  medicine?: Medicine | null
  doctor?: Doctor | null
  lab_test?: LabTest | null
  plus_plan?: PlusPlan | null
  badge_text?: string | null
  display_order: number
  is_active: boolean
  starts_at?: string | null
  ends_at?: string | null
  created_at: string
}

export type PromoBannerPlacement = 'HERO' | 'MID_PAGE' | 'PRE_FOOTER'

export interface PromoBanner {
  id: string
  title: string
  subtitle: string
  cta: string
  href: string
  icon: string
  gradient: string
  placement: PromoBannerPlacement
  display_order: number
  is_active: boolean
  created_at: string
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
  status: string
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
  // Shown only to the rider — give this to the pharmacy in person so they can verify it's really
  // you picking up. Null once already verified (pickup_verified_at set, status moves on).
  pickup_code: string | null
  pickup_verified_at: string | null
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
