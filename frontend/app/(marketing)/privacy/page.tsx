'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { useThemeStore } from '@/store/theme'
import Logo from '@/components/common/Logo'

const LAST_UPDATED = 'September 8, 2026'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-on-surface">{title}</h2>
      {children}
    </section>
  )
}

export default function PrivacyPage() {
  const { dark, toggle: toggleDark } = useThemeStore()
  const [support, setSupport] = useState<{ store_name?: string; support_email?: string; support_phone?: string }>({})

  useEffect(() => {
    api.get('/settings/').then((r) => setSupport(r.data.data || {})).catch(() => {})
  }, [])

  const store = support.store_name || 'Swasthaya'
  const email = support.support_email || 'support@pharmax.rauniyaraman.com.np'

  return (
    <div className="min-h-screen bg-background text-on-background">
      {/* Navbar */}
      <header className="border-b border-outline-variant bg-surface">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/"><Logo iconSize={40} textClassName="text-xl" /></Link>
          <nav className="flex items-center gap-3">
            <button onClick={toggleDark}
              className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors"
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
              <span className="material-symbols-outlined ms-filled" style={{ fontSize: '22px' }}>
                {dark ? 'light_mode' : 'dark_mode'}
              </span>
            </button>
            <Link href="/signin" className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:text-on-surface transition-colors">
              Sign in
            </Link>
            <Link href="/signup" className="px-4 py-2 text-sm font-semibold bg-primary text-on-primary rounded-xl hover:bg-primary-dark transition-colors">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <h1 className="text-3xl font-bold text-on-surface">Privacy Policy</h1>
          <p className="mt-2 text-sm text-on-surface-variant">Last updated: {LAST_UPDATED}</p>
        </div>

        <div className="space-y-10 text-sm leading-relaxed text-on-surface-variant">
          <p>
            At {store}, your privacy matters to us. This Privacy Policy explains what information we
            collect when you use our website and services, how we use it, who we share it with, and the
            choices you have. By using {store}, you agree to the practices described in this policy.
          </p>

          <Section title="Information We Collect">
            <ul className="list-disc pl-5 space-y-1.5">
              <li><span className="text-on-surface font-medium">Account information</span> — your name, email address, phone number, delivery addresses, and password when you create an account.</li>
              <li><span className="text-on-surface font-medium">Prescriptions &amp; health information</span> — prescription images and medicine details you upload or order, so that licensed pharmacies can review and fulfil them.</li>
              <li><span className="text-on-surface font-medium">Order &amp; payment information</span> — items ordered, order history, and payment details processed through our payment partners. We do not store your full card details.</li>
              <li><span className="text-on-surface font-medium">Location data</span> — the delivery location you set, used to show nearby pharmacies and estimate delivery times.</li>
              <li><span className="text-on-surface font-medium">Device &amp; usage data</span> — browser type, device information, and how you interact with the site, collected to keep the service secure and to improve it.</li>
            </ul>
          </Section>

          <Section title="How We Use Your Information">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Process and deliver your orders, including routing them to partner pharmacies and delivery riders.</li>
              <li>Verify prescriptions for prescription-only medicines.</li>
              <li>Send you order updates, receipts, and responses to your support requests.</li>
              <li>Detect and prevent fraud and keep your account secure.</li>
              <li>Improve our products, services, and overall experience.</li>
            </ul>
          </Section>

          <Section title="Prescriptions &amp; Health Information">
            <p>
              We treat prescription and health information with extra care. It is shared only with the
              licensed pharmacy fulfilling your order and the personnel needed to verify and dispense your
              medicines. We do not sell health information, and we do not use it for advertising.
            </p>
          </Section>

          <Section title="How We Share Information">
            <p>We share your information only where needed to provide the service:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><span className="text-on-surface font-medium">Partner pharmacies</span> — to review prescriptions and fulfil your orders.</li>
              <li><span className="text-on-surface font-medium">Delivery partners</span> — the delivery address and contact details required to complete your delivery.</li>
              <li><span className="text-on-surface font-medium">Payment processors</span> — to process payments securely (for example, eSewa, Khalti, and card networks).</li>
              <li><span className="text-on-surface font-medium">Legal &amp; safety</span> — when required by law or regulation, or to protect the rights and safety of our users.</li>
            </ul>
            <p>We do not sell your personal information to third parties.</p>
          </Section>

          <Section title="Data Retention">
            <p>
              We keep your information for as long as your account is active or as needed to provide our
              services. We may retain certain records longer where required to comply with legal and
              pharmacy record-keeping obligations, resolve disputes, and enforce our agreements.
            </p>
          </Section>

          <Section title="Data Security">
            <p>
              We use technical and organizational measures — including encryption in transit and access
              controls — to protect your information. No method of transmission or storage is completely
              secure, but we continuously work to safeguard your data.
            </p>
          </Section>

          <Section title="Your Rights &amp; Choices">
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Access and update your profile and delivery addresses from your account settings.</li>
              <li>Request deletion of your account and associated data, subject to records we must retain by law.</li>
              <li>Opt out of marketing messages at any time. You will still receive essential order and account notifications.</li>
            </ul>
          </Section>

          <Section title="Cookies">
            <p>
              We use cookies and similar technologies to keep you signed in, remember your preferences
              (such as your delivery location and light/dark theme), and understand how the site is used.
            </p>
          </Section>

          <Section title="Children's Privacy">
            <p>
              Our services are intended for users aged 18 and above. We do not knowingly collect personal
              information from children.
            </p>
          </Section>

          <Section title="Changes to This Policy">
            <p>
              We may update this Privacy Policy from time to time. Material changes will be posted on this
              page with a revised &ldquo;Last updated&rdquo; date.
            </p>
          </Section>

          <Section title="Contact Us">
            <p>
              If you have questions about this policy or your data, contact us at{' '}
              <a href={`mailto:${email}`} className="text-primary hover:underline">{email}</a>
              {support.support_phone ? <> or <a href={`tel:${support.support_phone}`} className="text-primary hover:underline">{support.support_phone}</a></> : null}.
            </p>
          </Section>
        </div>
      </main>

      <footer className="border-t border-outline-variant mt-8 py-8 text-center text-xs text-on-surface-variant space-y-2">
        <div className="flex items-center justify-center gap-4">
          <Link href="/" className="hover:text-on-surface transition-colors">Home</Link>
          <Link href="/about" className="hover:text-on-surface transition-colors">About</Link>
        </div>
        <p>© {new Date().getFullYear()} {store}. All rights reserved.</p>
      </footer>
    </div>
  )
}
