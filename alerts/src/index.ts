// escorpio-alerts: Telegram rate alerts for USDG on Robinhood Chain (Cloudflare Worker at alerts.escorpio.pro).
// - POST /telegram: Telegram webhook (checked against TELEGRAM_WEBHOOK_SECRET): /vault /borrow /list /stop /me /link
//   /unlink /help.
// - POST /link: escorpio.pro/link sends {code, address, signature}; a valid signature links the wallet to the chat and
//   its $ESCORPIO balance sets the tier. Off until TOKEN_ADDRESS and HOLDER_MIN are set (launch day).
// - Cron every minute: reads Escorpio's own /api/desk and sends due alerts (one per alert per hour at most). At 00:05
//   UTC it rechecks every linked wallet and sends holders the daily digest.
// D1 is written only when something changed (D1 writes are shared with other products).
// Secrets (set by the owner, never in code): TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET.
import { isAddress, isHex, type Address, type Hex } from 'viem'
import { parseDesk, type Desk } from '../../site/src/data/morpho.ts'
import { digest, type Snapshot } from './digest.ts'
import { LINK_TTL_MS, getChain, holdersOn, isCode, linkMessage, newCode, tierFor, type HolderEnv } from './holder.ts'
import { HELP, LIMITS, check, describe, isDue, parseCommand, type Alert, type Tier } from './logic.ts'

type D1Result<T> = { results: T[] }
type D1Stmt = { bind(...v: unknown[]): D1Stmt; all<T>(): Promise<D1Result<T>>; first<T>(): Promise<T | null>; run(): Promise<unknown> }
type D1 = { prepare(sql: string): D1Stmt; batch(s: D1Stmt[]): Promise<unknown> }
export type Env = HolderEnv & { DB: D1; TELEGRAM_BOT_TOKEN: string; TELEGRAM_WEBHOOK_SECRET: string; DESK_URL: string; SITE_ORIGIN?: string }
type Ctx = { waitUntil(p: Promise<unknown>): void }
type Chat = { chat_id: string; tier: Tier; wallet: string | null; checked_at: number }

const SITE = 'https://escorpio.pro'
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

async function send(env: Env, chatId: string, text: string) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  })
  return r.ok
}

const getChat = (env: Env, chatId: string) =>
  env.DB.prepare('SELECT chat_id, tier, wallet, checked_at FROM chats WHERE chat_id = ?').bind(chatId).first<Chat>()
const ensureChat = (env: Env, chatId: string) =>
  env.DB.prepare('INSERT OR IGNORE INTO chats (chat_id, tier, created_at) VALUES (?, ?, ?)').bind(chatId, 'free', Date.now())

async function onMessage(env: Env, chatId: string, text: string): Promise<string> {
  const c = parseCommand(text)
  if (c.cmd === 'help') {
    await ensureChat(env, chatId).run()
    return HELP
  }
  if (c.cmd === 'error') return c.text
  const chat = await getChat(env, chatId)
  const tier: Tier = chat?.tier === 'holder' ? 'holder' : 'free'
  if (c.cmd === 'me') {
    const l = LIMITS[tier]
    const wallet = chat?.wallet ? `Linked wallet: ${short(chat.wallet)}.` : holdersOn(env) ? 'No wallet linked. Send /link.' : 'Holder perks switch on when $ESCORPIO launches.'
    return `Plan: ${tier}. ${l.alerts} alerts, checked every ${l.everyMinutes === 1 ? 'minute' : `${l.everyMinutes} minutes`}.\n${wallet}`
  }
  if (c.cmd === 'link') {
    if (!holdersOn(env)) return `Holder perks switch on when $ESCORPIO launches. Until then everyone gets ${LIMITS.free.alerts} alerts, checked every ${LIMITS.free.everyMinutes} minutes.`
    const code = newCode()
    await env.DB.batch([
      ensureChat(env, chatId),
      env.DB.prepare('DELETE FROM link_codes WHERE chat_id = ? OR expires < ?').bind(chatId, Date.now()),
      env.DB.prepare('INSERT INTO link_codes (code, chat_id, expires) VALUES (?, ?, ?)').bind(code, chatId, Date.now() + LINK_TTL_MS),
    ])
    return [
      'Open this link within 15 minutes and sign one message with the wallet that holds $ESCORPIO:',
      `${SITE}/link?code=${code}`,
      '',
      'It is a signature, not a transaction: no cost, nothing moves. Never share a seed phrase or private key with anyone.',
    ].join('\n')
  }
  if (c.cmd === 'unlink') {
    if (!chat?.wallet) return 'No wallet is linked.'
    await env.DB.prepare("UPDATE chats SET wallet = NULL, tier = 'free', checked_at = 0 WHERE chat_id = ?").bind(chatId).run()
    return `Wallet unlinked. Plan: free, ${LIMITS.free.alerts} alerts.`
  }
  const mine = (await env.DB.prepare('SELECT id, kind, target, threshold FROM alerts WHERE chat_id = ? ORDER BY id').bind(chatId).all<Alert>()).results
  if (c.cmd === 'list') {
    if (!mine.length) return 'No alerts yet. Try /vault 5 or /borrow NVDA 2.'
    const max = LIMITS[tier].alerts
    return (
      mine.map((a, i) => `${i + 1}. ${describe(a)}${i >= max ? ' (paused: over your plan)' : ''}`).join('\n') +
      '\n\nRemove one with /stop <number>, all with /stop.'
    )
  }
  if (c.cmd === 'stop') {
    if (c.id === undefined) {
      await env.DB.prepare('DELETE FROM alerts WHERE chat_id = ?').bind(chatId).run()
      return 'All your alerts are removed.'
    }
    const a = mine[c.id - 1]
    if (!a) return 'No alert with that number. Send /list.'
    await env.DB.prepare('DELETE FROM alerts WHERE id = ? AND chat_id = ?').bind(a.id, chatId).run()
    return `Removed: ${describe(a)}.`
  }
  const max = LIMITS[tier].alerts
  if (mine.length >= max) return `You have ${max} alerts, the most on the ${tier} plan. Remove one with /stop <number>.`
  if (mine.some((a) => a.kind === c.kind && a.target === c.target && Math.abs(a.threshold - c.threshold) < 1e-9)) return 'You already have that alert.'
  await env.DB.batch([
    ensureChat(env, chatId),
    env.DB.prepare('INSERT INTO alerts (chat_id, kind, target, threshold, created_at, last_sent) VALUES (?, ?, ?, ?, ?, 0)').bind(
      chatId,
      c.kind,
      c.target,
      c.threshold,
      Date.now(),
    ),
  ])
  const every = LIMITS[tier].everyMinutes
  return `Alert set: ${describe(c)}. Checked every ${every === 1 ? 'minute' : `${every} minutes`}.`
}

// POST /link from escorpio.pro/link: verify the signature, read the balance, set the tier, tell the chat.
async function onLink(req: Request, env: Env): Promise<Response> {
  const cors = { 'access-control-allow-origin': env.SITE_ORIGIN || SITE, vary: 'origin', 'content-type': 'application/json' }
  const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: cors })
  if (!holdersOn(env)) return reply(409, { error: 'Holder perks switch on when $ESCORPIO launches.' })
  const body = (await req.json().catch(() => null)) as { code?: unknown; address?: unknown; signature?: unknown } | null
  const { code, address, signature } = body ?? {}
  if (!isCode(code) || typeof address !== 'string' || !isAddress(address) || typeof signature !== 'string' || !isHex(signature) || signature.length > 4000)
    return reply(400, { error: 'Bad request.' })
  const row = await env.DB.prepare('SELECT chat_id, expires FROM link_codes WHERE code = ?').bind(code).first<{ chat_id: string; expires: number }>()
  if (!row || row.expires < Date.now()) return reply(410, { error: 'This link has expired. Send /link to the bot again.' })
  let ok = false
  try {
    ok = await getChain(env).verify(address as Address, linkMessage(code, address), signature as Hex)
  } catch {
    ok = false
  }
  if (!ok) return reply(401, { error: 'The signature does not match this wallet.' })
  let tier: Tier
  try {
    tier = await tierFor(env, address as Address)
  } catch {
    return reply(502, { error: 'Could not read the balance on Robinhood Chain right now. Try again in a minute.' })
  }
  const wallet = address.toLowerCase()
  await env.DB.batch([
    env.DB.prepare('DELETE FROM link_codes WHERE code = ?').bind(code),
    env.DB.prepare('UPDATE chats SET wallet = NULL, tier = ? WHERE wallet = ? AND chat_id != ?').bind('free', wallet, row.chat_id),
    env.DB.prepare('UPDATE chats SET wallet = ?, tier = ?, checked_at = ? WHERE chat_id = ?').bind(wallet, tier, Date.now(), row.chat_id),
  ])
  const l = LIMITS[tier]
  await send(
    env,
    row.chat_id,
    tier === 'holder'
      ? `Wallet ${short(wallet)} linked. Plan: holder. ${l.alerts} alerts, checked every minute, plus the daily digest at 00:05 UTC.`
      : `Wallet ${short(wallet)} linked, but it holds less than the holder threshold right now. Plan: free. It is checked again every day.`,
  )
  return reply(200, { ok: true, tier })
}

async function readDesk(env: Env): Promise<Desk | null> {
  const res = await fetch(env.DESK_URL, { headers: { accept: 'application/json' } })
  const readAt = Number(res.headers.get('x-escorpio-read-at'))
  if (!res.ok || !(readAt > 0)) return null
  return parseDesk(await res.json(), readAt)
}

async function tick(env: Env, now: number) {
  const desk = await readDesk(env)
  if (!desk) return
  const rows = (
    await env.DB.prepare(
      'SELECT a.id, a.chat_id, a.kind, a.target, a.threshold, a.last_sent, c.tier FROM alerts a JOIN chats c ON c.chat_id = a.chat_id ORDER BY a.id',
    ).all<Alert & { tier: Tier }>()
  ).results
  const seen = new Map<string, number>()
  const sent: number[] = []
  for (const a of rows) {
    const tier: Tier = a.tier === 'holder' ? 'holder' : 'free'
    const nth = (seen.get(a.chat_id) ?? 0) + 1
    seen.set(a.chat_id, nth)
    if (nth > LIMITS[tier].alerts) continue // over the plan (e.g. after a holder sold): kept, but paused
    if (!isDue(a, tier, now)) continue
    const text = check(a, desk, now)
    if (text && (await send(env, a.chat_id, text))) sent.push(a.id)
  }
  if (sent.length) await env.DB.batch(sent.map((id) => env.DB.prepare('UPDATE alerts SET last_sent = ? WHERE id = ?').bind(now, id)))
  const t = new Date(now)
  if (t.getUTCHours() === 0 && t.getUTCMinutes() === 5) await daily(env, desk, now)
}

// 00:05 UTC: recheck every linked wallet (write only tiers that changed), then the digest to holders.
async function daily(env: Env, desk: Desk, now: number) {
  if (!holdersOn(env)) return
  const linked = (await env.DB.prepare('SELECT chat_id, tier, wallet, checked_at FROM chats WHERE wallet IS NOT NULL').all<Chat>()).results
  const changes: D1Stmt[] = []
  const holders: string[] = []
  for (const c of linked) {
    let tier: Tier = c.tier
    try {
      tier = await tierFor(env, c.wallet as Address)
    } catch {
      /* RPC down: keep yesterday's tier, try again tomorrow */
    }
    if (tier !== c.tier) {
      changes.push(env.DB.prepare('UPDATE chats SET tier = ?, checked_at = ? WHERE chat_id = ?').bind(tier, now, c.chat_id))
      await send(env, c.chat_id, tier === 'holder' ? 'Daily check: your wallet holds enough $ESCORPIO. Plan: holder.' : `Daily check: your wallet is under the holder threshold. Plan: free (${LIMITS.free.alerts} alerts).`)
    }
    if (tier === 'holder') holders.push(c.chat_id)
  }
  if (changes.length) await env.DB.batch(changes)
  if (!holders.length) return
  const prevRow = await env.DB.prepare("SELECT v FROM state WHERE k = 'digest'").first<{ v: string }>()
  const prev = prevRow ? (JSON.parse(prevRow.v) as Snapshot) : undefined
  const { text, snap } = digest(desk, prev)
  for (const id of holders) await send(env, id, text)
  await env.DB.prepare("INSERT INTO state (k, v) VALUES ('digest', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").bind(JSON.stringify(snap)).run()
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname === '/link') {
      if (req.method === 'OPTIONS')
        return new Response(null, {
          status: 204,
          headers: { 'access-control-allow-origin': env.SITE_ORIGIN || SITE, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', vary: 'origin' },
        })
      if (req.method === 'POST') return onLink(req, env)
    }
    if (req.method !== 'POST' || url.pathname !== '/telegram') return new Response('Escorpio rate alerts. Talk to the bot on Telegram.\n', { status: 404 })
    if (req.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET) return new Response('forbidden', { status: 403 })
    const update = (await req.json().catch(() => null)) as { message?: { chat?: { id?: number }; text?: string } } | null
    const chatId = update?.message?.chat?.id
    const text = update?.message?.text
    if (chatId !== undefined && typeof text === 'string' && text.startsWith('/')) {
      const reply = await onMessage(env, String(chatId), text.slice(0, 200))
      await send(env, String(chatId), reply)
    }
    return new Response('ok')
  },
  async scheduled(_e: unknown, env: Env, ctx: Ctx) {
    ctx.waitUntil(tick(env, Date.now()))
  },
}
