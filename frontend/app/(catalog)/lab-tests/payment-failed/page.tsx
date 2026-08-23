'use client'
import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'

const REASON_MESSAGES: Record<string, string> = {
  khalti_cancelled: 'You cancelled the Khalti payment.',
  esewa_cancelled: 'You cancelled the eSewa payment.',
  not_verified: 'The payment could not be verified with the gateway.',
  verify_error: 'We could not reach the payment gateway to verify your payment.',
  booking_not_found: 'We could not find the booking associated with this payment.',
  missing_data: 'The payment gateway did not return the expected data.',
  bad_data: 'The payment gateway returned data we could not read.',
  incomplete: 'The payment was not completed.',
}

function LabTestPaymentFailedContent() {
  const searchParams = useSearchParams()
  const reason = searchParams.get('reason')
  const message = (reason && REASON_MESSAGES[reason]) || 'Something went wrong with your payment. Your booking was not confirmed.'

  return (
    <div className="max-w-md mx-auto text-center space-y-6 py-8">
      <div className="w-20 h-20 bg-error/10 rounded-full flex items-center justify-center mx-auto">
        <span className="material-symbols-outlined ms-filled text-error" style={{ fontSize: '48px' }}>cancel</span>
      </div>
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Payment Failed</h1>
        <p className="text-sm text-on-surface-variant mt-2">{message}</p>
        <p className="text-xs text-on-surface-variant mt-1">This booking was cancelled — you'll need to book again.</p>
      </div>
      <div className="flex flex-col gap-3">
        <Link href="/lab-tests"
          className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity">
          Browse Lab Tests
        </Link>
        <Link href="/lab-test-bookings"
          className="w-full py-3 border border-outline-variant text-on-surface-variant text-sm font-semibold rounded-2xl hover:bg-surface-container transition-colors">
          My Bookings
        </Link>
      </div>
    </div>
  )
}

export default function LabTestPaymentFailedPage() {
  return (
    <Suspense fallback={null}>
      <LabTestPaymentFailedContent />
    </Suspense>
  )
}
