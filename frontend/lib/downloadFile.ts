/** Forces a real download instead of a same-tab navigation. A plain `<a download>` is ignored by
 * browsers for cross-origin URLs (the frontend and the Django media origin differ), so this
 * fetches the file as a blob and downloads that instead, which works regardless of origin. */
export async function downloadFile(url: string, filename: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Download failed.')
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = filename || 'prescription'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}
