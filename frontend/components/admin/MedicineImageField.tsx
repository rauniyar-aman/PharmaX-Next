'use client'
import { useState, useRef } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { resolveImg } from '@/lib/resolveImg'

interface Props {
  value: string
  onChange: (url: string) => void
}

export default function MedicineImageField({ value, onChange }: Props) {
  const [uploading, setUploading] = useState(false)
  const [broken, setBroken] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const res = await api.post('/admin/medicines/upload-image/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onChange(res.data.data.image_url)
      setBroken(false)
      toast.success('Image uploaded.')
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to upload image.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const previewSrc = value ? resolveImg(value) : null

  return (
    <div>
      <label className="text-xs font-medium text-on-surface-variant">Image</label>
      <div className="mt-1 flex items-start gap-4">
        <div className="w-28 h-28 rounded-xl border border-outline-variant bg-surface-container-low flex items-center justify-center overflow-hidden flex-shrink-0">
          {previewSrc && !broken ? (
            <img src={previewSrc} alt="" className="w-full h-full object-cover"
              onError={() => setBroken(true)} onLoad={() => setBroken(false)} />
          ) : (
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '28px' }}>
              {broken ? 'broken_image' : 'medication'}
            </span>
          )}
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="px-3 py-2 border border-outline-variant rounded-xl text-xs font-semibold text-on-surface hover:bg-surface-container-low transition-colors disabled:opacity-60 flex items-center gap-1.5">
              {uploading
                ? <><div className="w-3.5 h-3.5 border-2 border-on-surface-variant border-t-transparent rounded-full animate-spin" />Uploading...</>
                : <><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>upload</span>Upload Image</>
              }
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleFile} />
            {value && (
              <button type="button" onClick={() => { onChange(''); setBroken(false) }}
                className="px-3 py-2 text-xs font-semibold text-error hover:bg-error/10 rounded-xl transition-colors">
                Remove
              </button>
            )}
          </div>
          <input type="text" value={value} onChange={(e) => { onChange(e.target.value); setBroken(false) }}
            placeholder="Or paste an image URL..."
            className="w-full px-3 py-2 border border-outline-variant rounded-xl bg-surface text-xs text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-secondary transition" />
          {broken && value && <p className="text-[11px] text-error">This image doesn&apos;t load — check the URL is correct.</p>}
        </div>
      </div>
    </div>
  )
}
