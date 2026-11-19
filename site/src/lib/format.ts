// Number formats used everywhere, so a rate or a dollar amount never looks different from one page to the next.

/** 0.04792 -> "4.79%" */
export const pct = (x: number, digits = 2) => `${(x * 100).toFixed(digits)}%`

/** Compact dollars: $950, $67.3k, $534.5M */
export function usd(x: number) {
  const a = Math.abs(x)
  if (a >= 1e9) return `$${(x / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `$${(x / 1e6).toFixed(1)}M`
  if (a >= 1e4) return `$${(x / 1e3).toFixed(1)}k`
  if (a >= 1e3) return `$${(x / 1e3).toFixed(2)}k`
  return `$${Math.round(x)}`
}

/** Whole USDG with separators, for the calculator: 1,234.56 */
export const usdg = (x: number) =>
  x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** "0x8b16…891f" */
export const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

/** Local clock time of a reading, 24h, with seconds. */
export const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** "8s ago", "3 min ago" */
export function ago(ms: number, now: number) {
  const s = Math.max(0, Math.round((now - ms) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  return `${Math.round(m / 60)} h ago`
}

/** Age of a vault or market from its creation time (unix seconds). */
export function age(createdAt: number, now: number) {
  if (!createdAt) return 'n/a'
  const d = Math.floor((now / 1000 - createdAt) / 86_400)
  if (d < 1) return 'today'
  if (d < 60) return `${d} d`
  return `${Math.round(d / 30.4)} mo`
}
