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

/** Today, for a date input's `min` where the current day is still a valid choice. */
export function todayDateStr(): string {
  return localDateStr(new Date())
}

/** Tomorrow — the earliest date a sample collection or a consult can be booked for.
 *
 * Slots come from the doctor's weekly pattern with no regard for the clock
 * (`backend/api/scheduling.py`), and collection windows are fixed bands like "6:00 AM - 8:00 AM",
 * so a same-day booking would happily offer a time that has already passed. This floor is the only
 * thing preventing that, which is why it has to be the local day and not the UTC one.
 */
export function tomorrowDateStr(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return localDateStr(d)
}
