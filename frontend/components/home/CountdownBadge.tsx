'use client'
import { useState, useEffect } from 'react'

function timeLeftToday() {
  const now = new Date()
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const ms = Math.max(0, end.getTime() - now.getTime())
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return `${h}h ${m}m`
}

export default function CountdownBadge() {
  const [label, setLabel] = useState('')

  useEffect(() => {
    setLabel(timeLeftToday())
    const id = setInterval(() => setLabel(timeLeftToday()), 60_000)
    return () => clearInterval(id)
  }, [])

  if (!label) return null

  return (
    <div className="bg-error/90 text-on-error text-[11px] font-bold px-2.5 py-1.5 flex items-center justify-center gap-1">
      <span className="material-symbols-outlined ms-filled" style={{ fontSize: '13px' }}>schedule</span>
      Ends in {label}
    </div>
  )
}
