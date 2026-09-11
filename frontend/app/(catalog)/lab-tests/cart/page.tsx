'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth'
import { useLabCartStore } from '@/store/labCart'
import type { Address } from '@/types'
import { fetchServiceArea, isServiceable, type ServiceAreaConfig } from '@/lib/serviceArea'

const TIME_SLOTS = ['6:00 AM - 8:00 AM', '8:00 AM - 10:00 AM', '10:00 AM - 12:00 PM', '4:00 PM - 6:00 PM', '6:00 PM - 8:00 PM']

// Same three gateways / pay-now-vs-pay-on-collection choice as the single-test detail page — the
// difference here is that one payment settles every test in the cart at once (a booking group).
const PAYMENT_METHODS = [
  { id: 'CASH_ON_DELIVERY', label: 'Pay on Collection', icon: 'payments', desc: 'Pay the collector in cash when they arrive' },
  { id: 'ESEWA', label: 'eSewa', icon: 'account_balance_wallet', desc: 'Pay now via eSewa digital wallet' },
  { id: 'KHALTI', label: 'Khalti', icon: 'account_balance_wallet', desc: 'Pay now via Khalti digital wallet' },
]

function tomorrowDateStr() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

// #1 multi-person: every cart line (a test) is booked for one or more people. "Myself" (self:true)
// books for the account holder and sends no patient fields; "Someone else" captures inline details,
// and the same test can carry several people — each becomes its own booking at that test's price.
type PatientEntry = { self: boolean; name: string; phone: string; age: string; gender: string }
const selfEntry = (): PatientEntry => ({ self: true, name: '', phone: '', age: '', gender: '' })
const otherEntry = (): PatientEntry => ({ self: false, name: '', phone: '', age: '', gender: '' })

export default function LabCartPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const items = useLabCartStore((s) => s.items)
  const removeItem = useLabCartStore((s) => s.remove)
  const clearCart = useLabCartStore((s) => s.clear)

  const [addresses, setAddresses] = useState<Address[]>([])
  const [svcArea, setSvcArea] = useState<ServiceAreaConfig | null>(null)
  const [addressId, setAddressId] = useState('')
  const [date, setDate] = useState(tomorrowDateStr())
  const [timeSlot, setTimeSlot] = useState('')
  const [notes, setNotes] = useState('')
  const [method, setMethod] = useState('CASH_ON_DELIVERY')
  const [placing, setPlacing] = useState(false)
  // Who each test is booked for. Keyed by test id, defaulting to a single "Myself" entry. Lives in
  // local state, not the persisted cart — it's a checkout-time detail, re-defaulted if the cart set
  // changes (adding a test seeds "Myself"; removing one prunes it).
  const [patientsByTest, setPatientsByTest] = useState<Record<string, PatientEntry[]>>({})
  useEffect(() => {
    setPatientsByTest((prev) => {
      const next: Record<string, PatientEntry[]> = {}
      for (const i of items) next[i.id] = prev[i.id] ?? [selfEntry()]
      return next
    })
  }, [items])
  const getPeople = (id: string) => patientsByTest[id] ?? [selfEntry()]
  const addPerson = (id: string) => setPatientsByTest((p) => ({ ...p, [id]: [...(p[id] ?? [selfEntry()]), otherEntry()] }))
  const removePerson = (id: string, idx: number) => setPatientsByTest((p) => ({ ...p, [id]: (p[id] ?? []).filter((_, k) => k !== idx) }))
  const updatePerson = (id: string, idx: number, patch: Partial<PatientEntry>) =>
    setPatientsByTest((p) => ({ ...p, [id]: (p[id] ?? []).map((e, k) => (k === idx ? { ...e, ...patch } : e)) }))

  // The cart lives in localStorage, so gate the first render on mount to keep server/client HTML in
  // sync (same reason as the catalog list badge).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => { fetchServiceArea().then(setSvcArea).catch(() => {}) }, [])

  useEffect(() => {
    if (!user) return
    api.get('/addresses/').then((r) => {
      const addrs = r.data.data.addresses || []
      setAddresses(addrs)
      const def = addrs.find((a: Address) => a.is_default) || addrs[0]
      if (def) setAddressId(def.id)
    }).catch(() => {})
  }, [user])

  // One booking per (test, person). "Myself" entries count too — the total and booking count follow
  // the number of people, so a test booked for two people is priced (and booked) twice.
  const bookingCount = items.reduce((n, i) => n + getPeople(i.id).length, 0)
  const total = items.reduce((sum, i) => sum + Number(i.price) * getPeople(i.id).length, 0)

  const submitEsewaForm = (formUrl: string, params: Record<string, string>) => {
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = formUrl
    Object.entries(params).forEach(([key, value]) => {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = key
      input.value = value
      form.appendChild(input)
    })
    document.body.appendChild(form)
    form.submit()
  }

  const handleCheckout = async () => {
    if (!user) { router.push('/signin'); return }
    if (items.length === 0) { toast.error('Your cart is empty.'); return }
    if (!addressId) { toast.error('Please select a sample collection address.'); return }
    // Home sample collection is physical fulfillment — same service-area gate as delivery.
    const coAddr = addresses.find((a) => a.id === addressId)
    if (svcArea && coAddr) {
      const r = isServiceable(coAddr, svcArea)
      if (!r.ok) { toast.error(r.message); return }
    }
    if (!timeSlot) { toast.error('Please select a time slot.'); return }

    // Flatten each test's people into one booking line apiece. "Myself" sends no patient fields (the
    // booking is for the account holder); anyone else must at least be named so the collector knows
    // who they're collecting from.
    const cartItems: Record<string, unknown>[] = []
    for (const i of items) {
      for (const p of getPeople(i.id)) {
        if (p.self) { cartItems.push({ lab_test_id: i.id }); continue }
        if (!p.name.trim()) { toast.error(`Enter a name for the person you're booking ${i.name} for.`); return }
        cartItems.push({
          lab_test_id: i.id,
          patient_name: p.name.trim(),
          patient_phone: p.phone.trim() || undefined,
          patient_age: p.age ? Number(p.age) : undefined,
          patient_gender: p.gender || undefined,
        })
      }
    }

    setPlacing(true)
    try {
      // One request creates the group + one booking per line. COD confirms them all now; the online
      // gateways leave them PENDING until the group payment round trip verifies. Clear the cart only
      // once we've actually kicked off the next step, so a failed initiate leaves the cart intact.
      const res = await api.post('/lab-tests/bookings/batch/', {
        items: cartItems,
        address_id: addressId, scheduled_date: date, time_slot: timeSlot,
        notes: notes || undefined, payment_method: method,
      })
      const groupId = res.data.data.group_id

      if (method === 'ESEWA') {
        const payRes = await api.post('/payment/esewa/initiate-lab-group/', { group_id: groupId })
        clearCart()
        submitEsewaForm(payRes.data.data.formUrl, payRes.data.data.params)
        return
      }
      if (method === 'KHALTI') {
        const payRes = await api.post('/payment/khalti/initiate-lab-group/', { group_id: groupId })
        clearCart()
        window.location.href = payRes.data.data.payment_url
        return
      }

      clearCart()
      toast.success('Lab tests booked!')
      router.push('/lab-test-bookings')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Could not complete checkout.')
    } finally {
      setPlacing(false)
    }
  }

  if (!mounted) return <div className="flex items-center justify-center py-24"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>

  const selectedCartAddr = addresses.find((a) => a.id === addressId)
  const cartSvc = svcArea && selectedCartAddr ? isServiceable(selectedCartAddr, svcArea) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-on-surface-variant">
        <Link href="/lab-tests" className="hover:text-primary transition-colors">Lab Tests</Link>
        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chevron_right</span>
        <span className="text-on-surface font-medium">Cart</span>
      </div>

      {items.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-outline-variant text-center py-16">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '56px' }}>shopping_cart</span>
          <p className="text-base font-medium text-on-surface mt-3">Your lab test cart is empty</p>
          <p className="text-sm text-on-surface-variant mt-1">Add tests or packages to book them together in one visit.</p>
          <Link href="/lab-tests" className="inline-block mt-4 px-5 py-2.5 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity">
            Browse Lab Tests
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-surface rounded-2xl border border-outline-variant p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-on-surface">{items.length} {items.length === 1 ? 'test' : 'tests'} in cart</h2>
                <button onClick={clearCart} className="text-xs font-semibold text-error hover:underline">Clear all</button>
              </div>
              <div className="space-y-3">
                {items.map((i) => {
                  const people = getPeople(i.id)
                  return (
                    <div key={i.id} className="p-3 rounded-xl border border-outline-variant">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '20px' }}>{i.is_package ? 'inventory_2' : 'biotech'}</span>
                        <div className="min-w-0 flex-1">
                          <Link href={`/lab-tests/${i.id}`} className="text-sm font-semibold text-on-surface hover:text-primary transition-colors line-clamp-1">{i.name}</Link>
                          {i.is_package && <span className="ml-1.5 text-[10px] font-bold text-purple-600">PACKAGE</span>}
                        </div>
                        <span className="text-sm font-bold text-on-surface shrink-0">
                          NPR {Number(i.price).toFixed(0)}{people.length > 1 && <span className="text-on-surface-variant font-medium"> × {people.length}</span>}
                        </span>
                        <button onClick={() => removeItem(i.id)} aria-label={`Remove ${i.name}`}
                          className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-error hover:bg-error/5 transition-colors">
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>close</span>
                        </button>
                      </div>

                      {/* Who this test is being booked for — one booking per person */}
                      <div className="mt-2.5 pl-8 space-y-2">
                        {people.map((p, idx) => (
                          <div key={idx} className="rounded-lg border border-outline-variant/60 bg-surface-container-low/40 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex gap-1.5">
                                {[{ v: true, label: 'Myself' }, { v: false, label: 'Someone else' }].map((opt) => (
                                  <button key={opt.label} type="button" onClick={() => updatePerson(i.id, idx, { self: opt.v })}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${p.self === opt.v ? 'bg-primary text-on-primary' : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container'}`}>
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                              {people.length > 1 && (
                                <button type="button" onClick={() => removePerson(i.id, idx)} aria-label="Remove person"
                                  className="w-6 h-6 flex items-center justify-center rounded text-on-surface-variant hover:text-error transition-colors">
                                  <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                                </button>
                              )}
                            </div>
                            {!p.self && (
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                <input value={p.name} onChange={(e) => updatePerson(i.id, idx, { name: e.target.value })} placeholder="Full name"
                                  className="col-span-2 px-2.5 py-2 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface focus:outline-none focus:border-secondary transition" />
                                <input value={p.phone} onChange={(e) => updatePerson(i.id, idx, { phone: e.target.value })} placeholder="Phone (optional)"
                                  className="px-2.5 py-2 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface focus:outline-none focus:border-secondary transition" />
                                <input type="number" min={0} value={p.age} onChange={(e) => updatePerson(i.id, idx, { age: e.target.value })} placeholder="Age (optional)"
                                  className="px-2.5 py-2 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface focus:outline-none focus:border-secondary transition" />
                                <select value={p.gender} onChange={(e) => updatePerson(i.id, idx, { gender: e.target.value })}
                                  className="col-span-2 px-2.5 py-2 border border-outline-variant rounded-lg bg-surface text-xs text-on-surface focus:outline-none focus:border-secondary transition">
                                  <option value="">Gender (optional)</option>
                                  <option value="MALE">Male</option>
                                  <option value="FEMALE">Female</option>
                                  <option value="OTHER">Other</option>
                                </select>
                              </div>
                            )}
                          </div>
                        ))}
                        <button type="button" onClick={() => addPerson(i.id)}
                          className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                          <span className="material-symbols-outlined" style={{ fontSize: '15px' }}>add</span>
                          Add another person
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-on-surface-variant mt-3">Each test becomes its own booking (its own collector, status and report), collected together in one visit and settled by one payment. Book a test for several people by adding them here.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-surface rounded-2xl border border-outline-variant p-5 space-y-4 sticky top-[7.5rem]">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-on-surface-variant">Total</span>
                <span className="text-2xl font-bold text-on-surface">NPR {total.toFixed(0)}</span>
              </div>
              {bookingCount !== items.length && (
                <p className="-mt-2 text-[11px] text-on-surface-variant text-right">{bookingCount} bookings across {items.length} {items.length === 1 ? 'test' : 'tests'}</p>
              )}

              {user ? (
                <>
                  <div>
                    <label className="text-xs font-medium text-on-surface-variant">Sample Collection Address</label>
                    {addresses.length === 0 ? (
                      <Link href="/addresses" className="mt-1 block text-sm text-primary hover:underline">+ Add an address to book</Link>
                    ) : (
                      <>
                        <select value={addressId} onChange={(e) => setAddressId(e.target.value)}
                          className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
                          {addresses.map((a) => {
                            const bad = svcArea ? !isServiceable(a, svcArea).ok : false
                            return <option key={a.id} value={a.id}>{a.label} — {a.address_line1}, {a.city}{bad ? ' (outside service area)' : ''}</option>
                          })}
                        </select>
                        {cartSvc && !cartSvc.ok && (
                          <p className="mt-1 text-[11px] text-amber-700 flex items-start gap-1">
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>info</span>
                            <span>{cartSvc.message} <Link href="/addresses" className="underline">Update address</Link></span>
                          </p>
                        )}
                      </>
                    )}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-on-surface-variant">Preferred Date</label>
                    <input type="date" min={tomorrowDateStr()} value={date} onChange={(e) => setDate(e.target.value)}
                      className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-on-surface-variant">Time Slot</label>
                    <select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)}
                      className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface focus:outline-none focus:border-secondary transition">
                      <option value="">Select a time slot</option>
                      {TIME_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-on-surface-variant">Notes (optional)</label>
                    <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)}
                      className="mt-1 w-full px-3 py-2.5 border border-outline-variant rounded-xl bg-surface text-sm text-on-surface resize-none focus:outline-none focus:border-secondary transition" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-on-surface-variant">Payment Method</label>
                    <div className="mt-1.5 space-y-1.5">
                      {PAYMENT_METHODS.map((m) => (
                        <label key={m.id} className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-colors ${method === m.id ? 'border-primary bg-primary/5' : 'border-outline-variant hover:border-primary/40'}`}>
                          <input type="radio" name="payment" value={m.id} checked={method === m.id} onChange={() => setMethod(m.id)} className="accent-primary" />
                          <span className="material-symbols-outlined ms-filled text-on-surface-variant" style={{ fontSize: '18px' }}>{m.icon}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-on-surface">{m.label}</p>
                            <p className="text-[11px] text-on-surface-variant">{m.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                  <button onClick={handleCheckout} disabled={placing || addresses.length === 0 || (cartSvc ? !cartSvc.ok : false)}
                    className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2">
                    {placing
                      ? <><div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />{method === 'ESEWA' ? 'Redirecting to eSewa...' : method === 'KHALTI' ? 'Redirecting to Khalti...' : 'Booking...'}</>
                      : method === 'ESEWA' ? 'Book & Pay with eSewa' : method === 'KHALTI' ? 'Book & Pay with Khalti' : `Book ${bookingCount} ${bookingCount === 1 ? 'Test' : 'Tests'}`}
                  </button>
                </>
              ) : (
                <button onClick={() => router.push('/signin')}
                  className="w-full py-3 bg-primary text-on-primary text-sm font-bold rounded-2xl hover:opacity-90 transition-opacity">
                  Sign In to Book
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
