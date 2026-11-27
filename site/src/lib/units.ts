import { formatUnits, parseUnits } from 'viem'

// Token amounts as text and back. No React here: the MCP server (server/agent.ts) uses the same functions as the site.

/** Typed amount to raw units; anything unreadable is 0. */
export function toUnits(raw: string, decimals: number) {
  try {
    const clean = raw.replace(/,/g, '').trim()
    return clean ? parseUnits(clean, decimals) : 0n
  } catch {
    return 0n
  }
}

/** Raw units to a short readable number (up to 6 decimals, thousands separated). A tiny amount that would round to
 * zero says "< 0.01", so a dust debt never reads as nothing owed. */
export function showUnits(v: bigint, decimals: number, digits = 2) {
  const maxDigits = Math.max(digits, decimals > 6 ? 6 : digits)
  const n = Number(formatUnits(v, decimals))
  if (v > 0n && n < 10 ** -maxDigits) return `< ${(10 ** -maxDigits).toFixed(maxDigits)}`
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: maxDigits })
}
