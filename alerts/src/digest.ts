// Daily digest for holders: today's headline readings and how they moved since the last digest. Pure: the Worker
// keeps the last snapshot in D1 (state table, key 'digest').
import { biggestOpenVault, cheapest, collaterals, headlineVaults, widestGap } from '../../site/src/data/desk.ts'
import type { Desk } from '../../site/src/data/morpho.ts'

export type Snapshot = { at: number; best?: number; biggest?: number; loans: Record<string, number> }
const WATCH = ['NVDA', 'GOOGL', 'AAPL', 'SPY', 'TSLA']
const pct = (x: number) => `${(x * 100).toFixed(2)}%`
const usd = (x: number) => (x >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `$${(x / 1e3).toFixed(1)}k` : `$${Math.round(x)}`)
const move = (now?: number, before?: number) => {
  if (now === undefined || before === undefined) return ''
  const pts = (now - before) * 100
  return Math.abs(pts) < 0.005 ? ' (same)' : ` (${pts > 0 ? '+' : ''}${pts.toFixed(2)} pts)`
}

export function digest(d: Desk, prev?: Snapshot): { text: string; snap: Snapshot } {
  const best = headlineVaults(d)[0]
  const big = biggestOpenVault(d)
  const gap = widestGap(d)
  const loans: Record<string, number> = {}
  const lines: string[] = []
  for (const g of collaterals(d, 30_000)) {
    if (!WATCH.includes(g.symbol) || loans[g.symbol] !== undefined) continue
    const m = cheapest(g, 0, d.readAt)
    if (!m || m.borrowApy >= 0.5) continue
    loans[g.symbol] = m.borrowApy
    lines.push(`- ${g.symbol}: ${pct(m.borrowApy)}${move(m.borrowApy, prev?.loans[g.symbol])}, liquidation at ${pct(m.lltv)}`)
  }
  const when = new Date(d.readAt).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  const text = [
    `Escorpio daily, ${when}`,
    '',
    best ? `Best open vault: ${best.name}, ${pct(best.netApy)}${move(best.netApy, prev?.best)}, ${usd(best.totalUsd)} inside` : 'Best open vault: no data yet',
    big && big !== best ? `Biggest open vault: ${big.name}, ${pct(big.netApy)}${move(big.netApy, prev?.biggest)}, ${usd(big.totalUsd)} inside` : '',
    '',
    lines.length ? 'Cheapest USDG loan against:' : '',
    ...lines,
    gap ? `\nWidest gap: ${gap.collateral.symbol} at the same liquidation point, ${pct(gap.low.borrowApy)} vs ${pct(gap.high.borrowApy)}` : '',
    '',
    'Readings from Morpho, not advice. https://escorpio.pro',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')
    .trim()
  return { text, snap: { at: d.readAt, best: best?.netApy, biggest: big?.netApy, loans } }
}
