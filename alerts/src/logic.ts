// Rate alerts: the pure part (commands, matching, message text, limits). No I/O here, so scripts/check-alerts.ts can
// test every rule on hand-made desks. The Worker (index.ts) only reads and writes D1 and talks to Telegram.
import { cheapest, collaterals, headlineVaults, marketNotes, vaultNotes } from '../../site/src/data/desk.ts'
import type { Desk } from '../../site/src/data/morpho.ts'

export type Tier = 'free' | 'holder'
export type Kind = 'vault' | 'borrow'
export type Alert = { id: number; chat_id: string; kind: Kind; target: string; threshold: number; last_sent: number }

// Stage 1 limits (free for everyone). Holder limits switch on with the token (launch-kit/LAUNCH.md, stage 2).
export const LIMITS: Record<Tier, { alerts: number; everyMinutes: number }> = {
  free: { alerts: 2, everyMinutes: 15 },
  holder: { alerts: 10, everyMinutes: 1 },
}
export const RESEND_AFTER_MS = 60 * 60_000 // one message per alert per hour at most
export const STALE_AFTER_MS = 5 * 60_000 // never alert on a reading older than this
export const LOAN_MIN_FREE_USD = 10_000 // a loan alert needs a market that can still lend at least this much

const SITE = 'https://escorpio.pro'
const pct = (x: number) => `${(x * 100).toFixed(2)}%`
const usd = (x: number) => (x >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `$${(x / 1e3).toFixed(1)}k` : `$${Math.round(x)}`)
const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16) + ' UTC'

export const HELP = [
  'Escorpio rate alerts for USDG on Robinhood Chain. Readings from Morpho, not advice.',
  '',
  '/vault 5  : tell me when an open USDG vault pays 5% or more',
  '/borrow NVDA 2  : tell me when a USDG loan against NVDA costs 2% or less',
  '/list  : your alerts',
  '/stop  : remove all your alerts (/stop 2 removes alert 2)',
  '/me  : your plan and linked wallet',
  '/link  : link a wallet holding $ESCORPIO for more alerts',
  '',
  `Free: ${LIMITS.free.alerts} alerts, checked every ${LIMITS.free.everyMinutes} minutes, at most one message per alert per hour.`,
  `Every number: ${SITE}`,
].join('\n')

export type Command =
  | { cmd: 'help' }
  | { cmd: 'list' }
  | { cmd: 'stop'; id?: number }
  | { cmd: 'me' }
  | { cmd: 'link' }
  | { cmd: 'unlink' }
  | { cmd: 'add'; kind: Kind; target: string; threshold: number }
  | { cmd: 'error'; text: string }

/** Parses one Telegram message. Thresholds are percent a year (5 = 5%), stored as fractions. */
export function parseCommand(text: string): Command {
  const [raw = '', ...args] = text.trim().split(/\s+/)
  const cmd = raw.toLowerCase().replace(/@.*$/, '') // "/vault@EscorpioAlertsBot" in groups
  const num = (s?: string) => {
    const n = Number((s ?? '').replace(',', '.').replace('%', ''))
    return Number.isFinite(n) ? n : NaN
  }
  if (cmd === '/start' || cmd === '/help') return { cmd: 'help' }
  if (cmd === '/list') return { cmd: 'list' }
  if (cmd === '/me') return { cmd: 'me' }
  if (cmd === '/link') return { cmd: 'link' }
  if (cmd === '/unlink') return { cmd: 'unlink' }
  if (cmd === '/stop') {
    if (!args[0]) return { cmd: 'stop' }
    const id = Number(args[0])
    return Number.isInteger(id) && id > 0 ? { cmd: 'stop', id } : { cmd: 'error', text: 'Use /stop or /stop <number from /list>.' }
  }
  if (cmd === '/vault') {
    const t = num(args[0])
    if (!(t > 0 && t < 100)) return { cmd: 'error', text: 'Use /vault <percent>, for example /vault 5' }
    return { cmd: 'add', kind: 'vault', target: '*', threshold: t / 100 }
  }
  if (cmd === '/borrow') {
    const token = (args[0] ?? '').trim()
    const t = num(args[1])
    const okToken = /^0x[0-9a-fA-F]{40}$/.test(token) || /^[A-Za-z0-9.]{1,12}$/.test(token)
    if (!okToken || !(t > 0 && t < 100)) return { cmd: 'error', text: 'Use /borrow <token> <percent>, for example /borrow NVDA 2' }
    return { cmd: 'add', kind: 'borrow', target: token.startsWith('0x') ? token.toLowerCase() : token.toUpperCase(), threshold: t / 100 }
  }
  return { cmd: 'error', text: 'Unknown command. Send /help.' }
}

export const describe = (a: Pick<Alert, 'kind' | 'target' | 'threshold'>) =>
  a.kind === 'vault' ? `open USDG vault at ${pct(a.threshold)} or more` : `USDG loan against ${a.target} at ${pct(a.threshold)} or less`

/** Is this alert due on this minute for this tier, and not sent within the last hour? */
export function isDue(a: Alert, tier: Tier, now: number) {
  const minute = Math.floor(now / 60_000)
  return minute % LIMITS[tier].everyMinutes === 0 && now - a.last_sent >= RESEND_AFTER_MS
}

/**
 * The message for an alert, or null when nothing matches. Vaults: the best open one (same rule as the site headline)
 * at or above the threshold, with its size. Loans: the cheapest market for that collateral with at least $10k free to
 * borrow and no stop note, at or below the threshold (a tiny market never alerts). Old readings never alert.
 */
export function check(a: Pick<Alert, 'kind' | 'target' | 'threshold'>, d: Desk, now: number): string | null {
  if (now - d.readAt > STALE_AFTER_MS) return null
  const read = `Read from Morpho at ${hhmm(d.readAt)}. A reading, not advice: rates change every block.`
  if (a.kind === 'vault') {
    const v = headlineVaults(d).find((x) => x.netApy >= a.threshold)
    if (!v) return null
    const notes = vaultNotes(v, d.readAt).map((n) => `- ${n.text}`)
    return [
      `${v.name} pays ${pct(v.netApy)} a year after fees (your alert: ${pct(a.threshold)} or more).`,
      `Vault size ${usd(v.totalUsd)}, ${usd(v.withdrawableUsd)} withdrawable now.`,
      ...(notes.length ? ['Notes:', ...notes] : []),
      read,
      `${SITE}/earn`,
    ].join('\n')
  }
  const groups = collaterals(d).filter((g) => g.address.toLowerCase() === a.target.toLowerCase() || g.symbol.toUpperCase() === a.target)
  const hits = groups.map((g) => ({ g, m: cheapest(g, LOAN_MIN_FREE_USD, d.readAt) })).filter((x) => x.m && x.m.borrowApy <= a.threshold)
  const hit = hits.sort((x, y) => x.m!.borrowApy - y.m!.borrowApy)[0]
  if (!hit) return null
  const m = hit.m!
  const notes = marketNotes(m, d.readAt).map((n) => `- ${n.text}`)
  const shared = groups.length > 1 ? ` (contract ${hit.g.address.slice(0, 6)}…${hit.g.address.slice(-4)}; other tokens use the same symbol)` : ''
  return [
    `Borrowing USDG against ${hit.g.symbol}${shared} costs ${pct(m.borrowApy)} a year (your alert: ${pct(a.threshold)} or less).`,
    `Liquidation at ${pct(m.lltv)} of the collateral value, ${usd(m.availableUsd)} free to borrow now.`,
    ...(notes.length ? ['Notes:', ...notes] : []),
    read,
    `${SITE}/borrow?c=${hit.g.address}`,
  ].join('\n')
}
