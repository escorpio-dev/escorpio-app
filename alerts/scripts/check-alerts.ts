// Checks the alert Worker without Telegram or Cloudflare: commands, limits, matching, message text, the hourly limit and
// the stale-reading guard, plus the real Worker handlers against an in-memory SQLite that behaves like D1.
// Run: node scripts/check-alerts.ts   (Node 22.18+, uses node:sqlite)
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { parseDesk } from '../../site/src/data/morpho.ts'
import { digest } from '../src/digest.ts'
import { linkMessage, setChain } from '../src/holder.ts'
import worker, { type Env } from '../src/index.ts'
import { HELP, RESEND_AFTER_MS, check, isDue, parseCommand } from '../src/logic.ts'

const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'
const NVDA = '0x00000000000000000000000000000000000000a1'
const hid = (c: string) => '0x' + c.repeat(64)
const now = Date.UTC(2026, 10, 23, 12, 0) // a minute divisible by 15
const old = now / 1000 - 90 * 86_400
let n = 0
const vault = (name: string, apy: number, total: number, extra: Record<string, unknown> = {}) => ({
  name, address: '0x' + (++n).toString(16).padStart(40, '0'), listed: true, netApy: apy, totalAssetsUsd: total, liquidityUsd: total / 2,
  performanceFee: 0, managementFee: 0, creationTimestamp: old, asset: { address: USDG }, curators: { items: [{ name: 'C' }] }, warnings: [], ...extra,
})
const market = (id: string, apy: number, supply: number, free: number) => ({
  marketId: hid(id), lltv: '625000000000000000', creationTimestamp: old, listed: true,
  collateralAsset: { symbol: 'NVDA', name: 'NVDA', address: NVDA },
  state: { borrowApy: apy, supplyApy: apy * 0.8, supplyAssetsUsd: supply, borrowAssetsUsd: supply - free, liquidityAssetsUsd: free, utilization: 1 - free / supply },
  warnings: [],
})
const answer = {
  data: {
    markets: { items: [market('a', 0.2, 500_000, 100_000), market('b', 0.015, 236_000, 23_000)] },
    vaultV2s: { items: [vault('Big', 0.034, 2_000_000), vault('Small', 0.052, 67_000), vault('Closed', 0.09, 900_000, { warnings: [{ type: 'deposit_disabled', level: 'RED' }] })] },
  },
}
const desk = parseDesk(answer, now - 30_000)

// Commands.
assert.deepEqual(parseCommand('/vault 5'), { cmd: 'add', kind: 'vault', target: '*', threshold: 0.05 })
assert.deepEqual(parseCommand('/vault@EscorpioAlertsBot 4,5%'), { cmd: 'add', kind: 'vault', target: '*', threshold: 0.045 })
// Every comma and percent sign is handled, not just the first (CodeQL js/incomplete-sanitization).
assert.deepEqual(parseCommand('/vault 4,5%%'), { cmd: 'add', kind: 'vault', target: '*', threshold: 0.045 })
assert.equal(parseCommand('/vault 5,5,5').cmd, 'error')
assert.deepEqual(parseCommand('/borrow nvda 2'), { cmd: 'add', kind: 'borrow', target: 'NVDA', threshold: 0.02 })
assert.equal(parseCommand('/borrow NVDA').cmd, 'error')
assert.equal(parseCommand('/vault 0').cmd, 'error')
assert.equal(parseCommand('/vault 500').cmd, 'error')
assert.equal(parseCommand('/borrow <script> 2').cmd, 'error')
assert.deepEqual(parseCommand('/stop 2'), { cmd: 'stop', id: 2 })
assert.equal(parseCommand('hello').cmd, 'error')

// Matching: the closed 9% vault never counts; 5.2% is a $67k vault and the message says so.
const v5 = check({ kind: 'vault', target: '*', threshold: 0.05 }, desk, now)!
assert.match(v5, /Small pays 5\.20% a year after fees/)
assert.match(v5, /Vault size \$67\.0k/)
assert.match(v5, /not advice/)
assert.doesNotMatch(v5, /safe|guarantee|deposit now/i)
assert.equal(check({ kind: 'vault', target: '*', threshold: 0.06 }, desk, now), null)
const b2 = check({ kind: 'borrow', target: 'NVDA', threshold: 0.02 }, desk, now)!
assert.match(b2, /costs 1\.50% a year/)
assert.match(b2, /Liquidation at 62\.50%/)
assert.equal(check({ kind: 'borrow', target: 'NVDA', threshold: 0.01 }, desk, now), null)
assert.equal(check({ kind: 'borrow', target: 'AAPL', threshold: 0.5 }, desk, now), null)
// A tiny market (under $10k free) never alerts, even at a lower rate.
const tiny = parseDesk({ data: { markets: { items: [...answer.data.markets.items, market('c', 0.0006, 5_000, 1_200)] }, vaultV2s: answer.data.vaultV2s } }, now - 30_000)
assert.match(check({ kind: 'borrow', target: 'NVDA', threshold: 0.02 }, tiny, now)!, /costs 1\.50% a year/)
// A reading older than 5 minutes never alerts.
assert.equal(check({ kind: 'vault', target: '*', threshold: 0.01 }, parseDesk(answer, now - 6 * 60_000), now), null)

// Timing: free every 15 minutes, holder every minute, never twice within an hour.
const a = { id: 1, chat_id: '1', kind: 'vault' as const, target: '*', threshold: 0.05, last_sent: 0 }
assert.ok(isDue(a, 'free', now))
assert.ok(!isDue(a, 'free', now + 60_000))
assert.ok(isDue(a, 'holder', now + 60_000))
assert.ok(!isDue({ ...a, last_sent: now - RESEND_AFTER_MS + 60_000 }, 'holder', now))
console.log('logic: ok')

// The Worker against a SQLite stand-in for D1, a fake Telegram and a fake /api/desk.
const db = new DatabaseSync(':memory:')
db.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'))
const stmt = (sql: string, args: unknown[] = []) => ({
  bind: (...v: unknown[]) => stmt(sql, v),
  all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
  first: async () => db.prepare(sql).get(...(args as never[])) ?? null,
  run: async () => db.prepare(sql).run(...(args as never[])),
})
const D1 = { prepare: (sql: string) => stmt(sql), batch: async (s: ReturnType<typeof stmt>[]) => { for (const x of s) await x.run() } }
const env: Env = { DB: D1 as never, TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_WEBHOOK_SECRET: 'hook', DESK_URL: 'https://escorpio.pro/api/desk' }
const outbox: { chat: string; text: string }[] = []
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (String(url).startsWith('https://api.telegram.org/')) {
    const body = JSON.parse(String(init?.body))
    outbox.push({ chat: String(body.chat_id), text: body.text })
    return new Response('{"ok":true}')
  }
  if (String(url) === env.DESK_URL) return new Response(JSON.stringify(answer), { headers: { 'x-escorpio-read-at': String(now - 30_000) } })
  throw new Error('unexpected fetch ' + url)
}) as typeof fetch
const say = async (text: string, secret = 'hook') => {
  outbox.length = 0
  const res = await worker.fetch(new Request('https://alerts.escorpio.pro/telegram', {
    method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify({ message: { chat: { id: 42 }, text } }),
  }), env)
  return { status: res.status, reply: outbox[0]?.text ?? '' }
}

assert.equal((await say('/start', 'wrong')).status, 403)
assert.equal((await say('/start')).reply, HELP)
assert.match((await say('/vault 5')).reply, /Alert set: open USDG vault at 5\.00% or more/)
assert.match((await say('/vault 5')).reply, /already have/)
assert.match((await say('/borrow NVDA 2')).reply, /Alert set/)
assert.match((await say('/vault 3')).reply, /You have 2 alerts/)
assert.match((await say('/list')).reply, /1\. open USDG vault.*\n2\. USDG loan against NVDA/)

// Cron tick on a due minute: both alerts fire once; the next tick within the hour sends nothing.
// scheduled() uses Date.now(): pin it to the fixed due minute.
const ticks: Promise<unknown>[] = []
outbox.length = 0
const realNow = Date.now
Date.now = () => now
await worker.scheduled({}, env, { waitUntil: (p) => ticks.push(p) })
await Promise.all(ticks)
assert.equal(outbox.length, 2, 'two alerts sent')
assert.ok(outbox.every((m) => m.chat === '42'))
outbox.length = 0
Date.now = () => now + 15 * 60_000
await worker.scheduled({}, env, { waitUntil: (p) => ticks.push(p) })
await Promise.all(ticks)
assert.equal(outbox.length, 0, 'nothing again within the hour')
Date.now = realNow

assert.match((await say('/stop 1')).reply, /Removed: open USDG vault/)
assert.match((await say('/list')).reply, /^1\. USDG loan against NVDA/)
assert.match((await say('/stop')).reply, /All your alerts are removed/)
assert.match((await say('/list')).reply, /No alerts yet/)
assert.match((await say('/link')).reply, /switch on when \$ESCORPIO launches/)
assert.match((await say('/me')).reply, /Plan: free\. 2 alerts, checked every 15 minutes/)
console.log('worker: ok')

// Stage 2: holder perks on (a fake token, a fake chain). Link, upgrade, digest, daily downgrade, paused alerts.
const TOKEN = '0x00000000000000000000000000000000000000e5'
const WALLET = '0x00000000000000000000000000000000000000c7'
const balances = new Map<string, bigint>([[WALLET, 200n]])
let signed = ''
setChain({
  verify: async (addr, message) => addr.toLowerCase() === WALLET && message === signed,
  balance: async (_t, owner) => balances.get(owner.toLowerCase()) ?? 0n,
})
Object.assign(env, { TOKEN_ADDRESS: TOKEN, HOLDER_MIN: '100' })
const post = async (body: unknown) => {
  outbox.length = 0
  const res = await worker.fetch(new Request('https://alerts.escorpio.pro/link', { method: 'POST', body: JSON.stringify(body) }), env)
  return { status: res.status, json: (await res.json()) as Record<string, unknown>, tg: outbox[0]?.text ?? '' }
}
const linkReply = (await say('/link')).reply
const code = linkReply.match(/code=([A-Za-z0-9]{12})/)![1]
assert.match(linkReply, /signature, not a transaction/)
assert.equal((await post({ code: 'nope', address: WALLET, signature: '0x00' })).status, 400)
assert.equal((await post({ code, address: WALLET, signature: '0xdead' })).status, 401, 'wrong message signed')
signed = linkMessage(code, WALLET)
const linked = await post({ code, address: WALLET, signature: '0xbeef' })
assert.equal(linked.status, 200)
assert.equal(linked.json.tier, 'holder')
assert.match(linked.tg, /Plan: holder\. 10 alerts, checked every minute/)
assert.equal((await post({ code, address: WALLET, signature: '0xbeef' })).status, 410, 'a code works once')
assert.match((await say('/me')).reply, /Plan: holder\. 10 alerts, checked every minute\.\nLinked wallet: 0x0000…00c7/)
for (const t of [3, 3.5, 4]) assert.match((await say(`/vault ${t}`)).reply, /Checked every minute/)
assert.match((await say('/list')).reply, /3\. open USDG vault at 4\.00%/)

// 00:05 UTC: daily recheck keeps the holder, sends the digest; alerts fire on a non-15 minute for holders.
const dailyAt = Date.UTC(2026, 10, 24, 0, 5)
outbox.length = 0
Date.now = () => dailyAt
const fresh = { ...answer }
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (String(url).startsWith('https://api.telegram.org/')) {
    const body = JSON.parse(String(init?.body))
    outbox.push({ chat: String(body.chat_id), text: body.text })
    return new Response('{"ok":true}')
  }
  if (String(url) === env.DESK_URL) return new Response(JSON.stringify(fresh), { headers: { 'x-escorpio-read-at': String(dailyAt - 20_000) } })
  throw new Error('unexpected fetch ' + url)
}) as typeof fetch
await worker.scheduled({}, env, { waitUntil: (p) => ticks.push(p) })
await Promise.all(ticks)
assert.equal(outbox.filter((m) => /pays/.test(m.text)).length, 3, 'three holder alerts on minute 5')
const dig = outbox.find((m) => m.text.startsWith('Escorpio daily'))
assert.ok(dig, 'digest sent')
assert.match(dig!.text, /Best open vault: Small, 5\.20%, \$67\.0k inside/)
assert.match(dig!.text, /Biggest open vault: Big, 3\.40%/)
assert.match(dig!.text, /NVDA: 1\.50%/)
assert.match(dig!.text, /not advice/)

// Next day the wallet sold: downgraded, told once, and alerts over the free plan are paused, not deleted.
balances.set(WALLET, 0n)
outbox.length = 0
Date.now = () => dailyAt + 86_400_000
await worker.scheduled({}, env, { waitUntil: (p) => ticks.push(p) })
await Promise.all(ticks)
assert.ok(outbox.some((m) => /Plan: free/.test(m.text)), 'downgrade message')
assert.ok(!outbox.some((m) => m.text.startsWith('Escorpio daily')), 'no digest for free')
Date.now = realNow
assert.match((await say('/list')).reply, /3\. open USDG vault at 4\.00% or more \(paused: over your plan\)/)
assert.match((await say('/unlink')).reply, /Wallet unlinked/)
console.log('holders: ok')

// Digest moves are shown against the previous snapshot.
const d2 = digest(desk, { at: 0, best: 0.05, biggest: 0.034, loans: { NVDA: 0.02 } })
assert.match(d2.text, /5\.20% \(\+0\.20 pts\)/)
assert.match(d2.text, /NVDA: 1\.50% \(-0\.50 pts\)/)
console.log('digest: ok')
