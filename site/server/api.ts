// Shared by the Pages Functions under functions/api: one reading of the Morpho API per minute, kept in this isolate's
// memory and in Cloudflare's cache, so a burst of visitors or bots never turns into a burst of calls to Morpho.
// Morpho's answer is kept byte for byte; every endpoint parses it with the same parseDesk the site uses.
import { biggestOpenVault, cheapest, collaterals, headlineVaults, marketNotes, vaultNotes, widestGap } from '../src/data/desk.ts'
import { CHAIN_ID, EXPLORER, MORPHO_API, USDG, fetchMorpho, parseDesk, type Desk, type Market, type Vault } from '../src/data/morpho.ts'
import { chainSummary, checkVaults, vaultCheckOut, type ChainCheck } from './onchain.ts'
import { serverClient, type RpcEnv } from './rpc.ts'

export type Ctx = { request: Request; waitUntil(p: Promise<unknown>): void; env?: RpcEnv }
/** Morpho's reading plus the on-chain check of the vault sizes (missing when the chain did not answer). */
export type ServerDesk = Desk & { chain?: ChainCheck; chainError?: string }
export type Reading = { body: string; readAt: number }

const FRESH_MS = 60_000
const CACHE_KEY = 'https://escorpio.pro/__cache/morpho-desk-v1'
const edgeCache = () => (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default
let memory: Reading | undefined

export async function readMorpho(ctx: Ctx): Promise<Reading> {
  const now = Date.now()
  if (memory && now - memory.readAt < FRESH_MS) return memory
  const cache = edgeCache()
  const hit = await cache?.match(CACHE_KEY)
  if (hit) {
    const readAt = Number(hit.headers.get('x-read-at'))
    if (now - readAt < FRESH_MS) return (memory = { body: await hit.text(), readAt })
  }
  const answer = await fetchMorpho(AbortSignal.timeout(10_000))
  parseDesk(answer, now) // never keep an answer the site could not use
  const reading = { body: JSON.stringify(answer), readAt: now }
  memory = reading
  if (cache)
    ctx.waitUntil(
      cache.put(
        CACHE_KEY,
        new Response(reading.body, { headers: { 'content-type': 'application/json', 'x-read-at': String(now), 'cache-control': 'max-age=120' } }),
      ),
    )
  return reading
}

type Checked = { chain?: ChainCheck; error?: string }
// One chain check per Morpho reading and isolate, shared by requests that arrive while it runs. A failed check is kept
// too, so a down chain is not asked again on every request; the next Morpho reading (a minute later) tries again.
let checking: { readAt: number; result: Promise<Checked> } | undefined

export async function readDesk(ctx: Ctx): Promise<ServerDesk> {
  const r = await readMorpho(ctx)
  const d = parseDesk(JSON.parse(r.body), r.readAt)
  if (checking?.readAt !== r.readAt) {
    const result = checkVaults(serverClient(ctx.env), d.vaults).then(
      (chain): Checked => ({ chain }),
      (e): Checked => ({ error: e instanceof Error ? e.message : String(e) }),
    )
    checking = { readAt: r.readAt, result }
  }
  const { chain, error } = await checking.result
  return { ...d, chain, chainError: error }
}

const HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': 'public, max-age=30',
  'x-content-type-options': 'nosniff',
}

export const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(data, null, 2) + '\n', { status, headers: { ...HEADERS, ...extra } })

export const failed = (e: unknown) =>
  json({ error: 'Could not read the Morpho API right now', detail: e instanceof Error ? e.message : String(e) }, 502, { 'cache-control': 'no-store' })

// Rates leave as percent with 4 decimals (3.9512 means 3.9512% a year), money as whole US dollars.
const pct = (x: number) => Math.round(x * 1e6) / 1e4
const usd = (x: number) => Math.round(x)
const iso = (t: number) => new Date(t).toISOString()

export const about = (d: ServerDesk) => ({
  chainId: CHAIN_ID,
  asset: { symbol: 'USDG', address: USDG },
  source: MORPHO_API,
  checkedOnChain: chainSummary(d.chain, d.chainError),
  readAt: iso(d.readAt),
  ageSeconds: Math.max(0, Math.round((Date.now() - d.readAt) / 1000)),
  units: { rates: 'percent per year', money: 'US dollars' },
  note: 'Readings, not advice. Rates change every block, vault shares can lose value and loans can be liquidated.',
})

export const vaultOut = (v: Vault, now: number, chain?: ChainCheck) => ({
  name: v.name,
  address: v.address,
  netApyPct: pct(v.netApy),
  totalUsd: usd(v.totalUsd),
  onChain: vaultCheckOut(chain?.vaults[v.address.toLowerCase()]),
  withdrawableUsd: usd(v.withdrawableUsd),
  curators: v.curators,
  listedByMorpho: v.listed,
  createdAt: v.createdAt ? iso(v.createdAt * 1000) : null,
  notes: vaultNotes(v, now),
  explorer: `${EXPLORER}/address/${v.address}`,
  page: 'https://escorpio.pro/earn',
})

export const marketOut = (m: Market, now: number) => ({
  marketId: m.id,
  collateral: m.collateral,
  liquidationLtvPct: pct(m.lltv),
  borrowApyPct: pct(m.borrowApy),
  supplyApyPct: pct(m.supplyApy),
  suppliedUsd: usd(m.supplyUsd),
  borrowedUsd: usd(m.borrowUsd),
  freeToBorrowUsd: usd(m.availableUsd),
  usedPct: pct(m.utilization),
  listedByMorpho: m.listed,
  createdAt: m.createdAt ? iso(m.createdAt * 1000) : null,
  notes: marketNotes(m, now),
  page: 'https://escorpio.pro/borrow',
})

export function rates(d: ServerDesk) {
  const now = d.readAt
  const out = (v: Vault) => vaultOut(v, now, d.chain)
  const open = headlineVaults(d)
  const gap = widestGap(d)
  return {
    ...about(d),
    bestOpenVault: open[0] ? out(open[0]) : null,
    // Shown with the best rate so a small vault never reads as the whole market.
    biggestOpenVault: (() => {
      const b = biggestOpenVault(d)
      return b ? out(b) : null
    })(),
    openVaults: open.slice(0, 10).map(out),
    cheapestLoanPerCollateral: collaterals(d)
      .slice(0, 25)
      .map((g) => {
        const m = cheapest(g, 0, now)
        return { collateral: { symbol: g.symbol, name: g.name, address: g.address }, suppliedUsd: usd(g.supplyUsd), cheapest: m ? marketOut(m, now) : null }
      }),
    widestGap: gap
      ? {
          collateral: { symbol: gap.collateral.symbol, address: gap.collateral.address },
          liquidationLtvPct: pct(gap.lltv),
          lowBorrowApyPct: pct(gap.low.borrowApy),
          highBorrowApyPct: pct(gap.high.borrowApy),
          gapPoints: Math.round(gap.points * 100) / 100,
          lowMarketId: gap.low.id,
          highMarketId: gap.high.id,
        }
      : null,
    counts: { vaults: d.vaults.length, markets: d.markets.length, marketsCountedByMorpho: d.marketCount },
    more: { vaults: '/api/vaults', markets: '/api/markets', raw: '/api/desk', method: 'https://escorpio.pro/method' },
  }
}
