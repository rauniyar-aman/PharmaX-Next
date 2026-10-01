/** `YYYY-MM-DD` for a Date, read in the browser's own timezone.
 *
 * Deliberately not `toISOString().slice(0, 10)`, which formats the *UTC* instant: in Nepal
 * (UTC+5:45) that reads back as the previous day until 05:45 every morning, so anything built on it
 * is off by one for the first six hours of the day. Manual parts rather than `toLocaleDateString`
 * so the output never depends on the visitor's locale.
 */
function localDateStr(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

/** Today, for a date input's `min`. Same-day booking is allowed: the doctor's slot list is filtered
 * to still-future times server-side (`backend/api/scheduling.py`) and the lab collection bands are
 * filtered against the clock on the pages that render them, so a time that has already passed is
 * never offered even when the chosen date is today. */
export function todayDateStr(): string {
  return localDateStr(new Date())
}
