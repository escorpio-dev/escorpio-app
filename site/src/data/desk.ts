// Turns raw Morpho rows into what the pages show: risk notes in plain words, the headline picks, collateral groups and
// the rate gaps. Pure functions, checked by scripts/check-desk.ts.
import type { Desk, Market, Vault, Warning } from '@/data/morpho'

export type Note = { text: string; stop: boolean } // stop = a reason not to use it right now
const DAY = 86_400

// Morpho's own warning codes, said in plain words. Unknown codes are shown as-is rather than hidden.
export const WARNING_TEXT: Record<string, string> = {
  deposit_disabled: 'Deposits closed',
  timelock: 'Short timelock (settings can change fast)',
  not_whitelisted: 'Not listed in the Morpho app',
  unrecognized_asset: 'Asset not recognised by Morpho',
  unrecognized_collateral_asset: 'Collateral not recognised by Morpho',
  oracle_unusable: 'Price feed not usable',
  low_liquidity: 'Low liquidity',
  bad_debt_realized: 'Has had bad debt',
  bad_debt_unrealized: 'Has unpaid bad debt',
}
export const STOP_CODES = new Set(['deposit_disabled', 'oracle_unusable', 'bad_debt_unrealized'])

// Our own notes in plain words: [label, meaning, stop]. Shown on the Method page and by the MCP tool
// explain_risk_notes; keep in step with vaultNotes / marketNotes below.
export const OWN_NOTES: [string, string, boolean][] = [
  ['Small (under $100k)', 'Vault holds less than $100k. A few deposits or withdrawals can move its rate a lot.', false],
  ['Small market (under $10k)', 'Market has less than $10k supplied.', false],
  ['New (under 30 days)', 'Created less than 30 days ago, so there is little history to judge it by.', false],
  ['Almost nothing can be withdrawn now', 'Less than 1% of the vault (or under $100) could leave right now. You may have to wait to get out.', true],
  ['No named curator', 'Morpho shows no curator name for this vault.', false],
  ['Very high rate, ask why', 'Net rate above 25% a year. Someone is paying for a risk.', false],
  ['Rate below zero', 'The vault is losing value at today\'s rate.', true],
  ['Almost fully borrowed', 'At least 98% of the market is lent out: little is left to borrow, and lenders may wait to withdraw.', false],
  ['Extreme rate', 'Borrow rate above 50% a year.', false],
]

const fromWarnings = (ws: Warning[]): Note[] =>
  ws.map((w) => ({
    text: WARNING_TEXT[w.type] ?? w.type.replace(/_/g, ' '),
    stop: STOP_CODES.has(w.type) || (w.level === 'RED' && w.type !== 'timelock'),
  }))

const isNew = (createdAt: number, now: number) => createdAt > 0 && now / 1000 - createdAt < 30 * DAY

export function vaultNotes(v: Vault, now: number): Note[] {
  const n = fromWarnings(v.warnings)
  if (v.totalUsd < 100_000) n.push({ text: 'Small (under $100k)', stop: false })
  if (isNew(v.createdAt, now)) n.push({ text: 'New (under 30 days)', stop: false })
  if (v.totalUsd > 0 && v.withdrawableUsd < Math.max(100, v.totalUsd * 0.01))
    n.push({ text: 'Almost nothing can be withdrawn now', stop: true })
  if (!v.curators.length) n.push({ text: 'No named curator', stop: false })
  if (v.netApy > 0.25) n.push({ text: 'Very high rate, ask why', stop: false })
  if (v.netApy < 0) n.push({ text: 'Rate below zero', stop: true })
  return n
}

export function marketNotes(m: Market, now: number): Note[] {
  const n = fromWarnings(m.warnings)
  if (m.supplyUsd < 10_000) n.push({ text: 'Small market (under $10k)', stop: false })
  if (isNew(m.createdAt, now)) n.push({ text: 'New (under 30 days)', stop: false })
  if (m.utilization >= 0.98) n.push({ text: 'Almost fully borrowed', stop: false })
  if (m.borrowApy > 0.5) n.push({ text: 'Extreme rate', stop: false })
  return n
}

/** Vaults good enough for the headline: listed by Morpho, open, no stop notes, at least $50k inside. */
export function headlineVaults(d: Desk): Vault[] {
  return d.vaults
    .filter((v) => v.listed && v.totalUsd >= 50_000 && v.netApy > 0)
    .filter((v) => !vaultNotes(v, d.readAt).some((n) => n.stop))
    .filter((v) => !v.warnings.some((w) => w.level === 'RED'))
    .sort((a, b) => b.netApy - a.netApy)
}

export type Collateral = {
  address: string
  symbol: string
  name: string
  markets: Market[] // cheapest first
  supplyUsd: number
  availableUsd: number
}

/** Markets grouped by collateral contract (not symbol), biggest first. */
export function collaterals(d: Desk, minSupplyUsd = 1_000): Collateral[] {
  const by = new Map<string, Collateral>()
  for (const m of d.markets) {
    const key = m.collateral.address.toLowerCase()
    const g = by.get(key) ?? { address: m.collateral.address, symbol: m.collateral.symbol, name: m.collateral.name, markets: [], supplyUsd: 0, availableUsd: 0 }
    g.markets.push(m)
    g.supplyUsd += m.supplyUsd
    g.availableUsd += m.availableUsd
    by.set(key, g)
  }
  return [...by.values()]
    .filter((g) => g.supplyUsd >= minSupplyUsd)
    .map((g) => ({ ...g, markets: g.markets.sort((a, b) => a.borrowApy - b.borrowApy) }))
    .sort((a, b) => b.supplyUsd - a.supplyUsd)
}

/** Symbols used by more than one collateral contract: shown with their address so nobody picks the wrong one. */
export function sharedSymbols(groups: Collateral[]): Set<string> {
  const seen = new Map<string, number>()
  for (const g of groups) seen.set(g.symbol, (seen.get(g.symbol) ?? 0) + 1)
  return new Set([...seen].filter(([, n]) => n > 1).map(([s]) => s))
}

/** Cheapest market that can lend `amountUsd` right now (at least $1k), skipping markets with stop notes. */
export function cheapest(g: Collateral, amountUsd: number, now: number): Market | undefined {
  const need = Math.max(amountUsd, 1_000)
  return g.markets.find((m) => m.availableUsd >= need && !marketNotes(m, now).some((n) => n.stop))
}

export type Gap = { collateral: Collateral; lltv: number; low: Market; high: Market; points: number }

/**
 * Widest rate gap for the same collateral at the same liquidation point (LLTV): the "same thing, different price"
 * number. Only markets with $10k+ supplied, $1k+ free to borrow, a rate under 100% and collateral Morpho recognises.
 */
export function widestGap(d: Desk): Gap | undefined {
  let best: Gap | undefined
  for (const g of collaterals(d)) {
    const ok = g.markets.filter(
      (m) =>
        m.supplyUsd >= 10_000 &&
        m.availableUsd >= 1_000 &&
        m.borrowApy < 1 &&
        !m.warnings.some((w) => w.type === 'unrecognized_collateral_asset'),
    )
    const byLltv = new Map<number, Market[]>()
    for (const m of ok) byLltv.set(m.lltv, [...(byLltv.get(m.lltv) ?? []), m])
    for (const [lltv, ms] of byLltv) {
      if (ms.length < 2) continue
      const low = ms.reduce((a, b) => (b.borrowApy < a.borrowApy ? b : a))
      const high = ms.reduce((a, b) => (b.borrowApy > a.borrowApy ? b : a))
      const points = (high.borrowApy - low.borrowApy) * 100
      if (!best || points > best.points) best = { collateral: g, lltv, low, high, points }
    }
  }
  return best
}

/** Simple interest for one year at today's rate. Rates move; the page says so next to every result. */
export const yearly = (amount: number, apy: number) => amount * apy
