// Site traffic for /stats, read from Cloudflare's own zone analytics for escorpio.pro (the edge counts every request;
// no cookies, no tracking script on the site). Read at most every 10 minutes, kept in this isolate's memory and in
// Cloudflare's cache, so visitors never turn into calls to the Cloudflare API.
//
// Numbers are passed through as Cloudflare counts them, never adjusted:
// - pageViews: HTML page loads that day (people and bots alike).
// - visitors: unique IP addresses that day (Cloudflare's "uniques"), bots and crawlers included. Not addable across days.
// - requests: every request, pages plus pictures, scripts and API calls.

export const ZONE_ID = '915d5e8361ae96dcda347b57182e19cd' // escorpio.pro, not a secret
export const SINCE = '2026-11-22' // the day escorpio.pro went live
export const STATS_FRESH_MS = 10 * 60_000

export type Day = { date: string; pageViews: number; visitors: number; requests: number }
export type Traffic = {
  since: string
  readAt: string
  source: string
  days: Day[]
  totals: { pageViews: number; requests: number }
  today: Day | null
  yesterday: Day | null
  busiest: Day | null
  notes: string[]
}

const QUERY = `query($z: String!, $d: Date!) { viewer { zones(filter: { zoneTag: $z }) {
  httpRequests1dGroups(limit: 1000, filter: { date_geq: $d }, orderBy: [date_ASC]) {
    dimensions { date } sum { requests pageViews } uniq { uniques } } } } }`

type Group = { dimensions: { date: string }; sum: { requests: number; pageViews: number }; uniq: { uniques: number } }

export async function fetchTraffic(token: string, signal?: AbortSignal, f: typeof fetch = fetch): Promise<Day[]> {
  const res = await f('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { z: ZONE_ID, d: SINCE } }),
    signal,
  })
  const j = (await res.json().catch(() => null)) as {
    data?: { viewer?: { zones?: { httpRequests1dGroups?: Group[] }[] } }
    errors?: { message: string }[] | null
  } | null
  if (!res.ok || !j || (j.errors && j.errors.length)) throw new Error(j?.errors?.[0]?.message ?? `Cloudflare answered ${res.status}`)
  const groups = j.data?.viewer?.zones?.[0]?.httpRequests1dGroups
  if (!Array.isArray(groups)) throw new Error('Cloudflare sent no traffic groups')
  return parseGroups(groups)
}

export function parseGroups(groups: Group[]): Day[] {
  return groups
    .map((g) => ({
      date: String(g.dimensions?.date ?? ''),
      pageViews: count(g.sum?.pageViews),
      visitors: count(g.uniq?.uniques),
      requests: count(g.sum?.requests),
    }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date) && d.date >= SINCE)
    .sort((a, b) => a.date.localeCompare(b.date))
}

const count = (x: unknown) => {
  const n = Number(x)
  if (!Number.isFinite(n) || n < 0) throw new Error('Cloudflare sent a count that is not a number')
  return Math.floor(n)
}

const utcDate = (t: number) => new Date(t).toISOString().slice(0, 10)

export function summarize(days: Day[], readAt: number): Traffic {
  const today = utcDate(readAt)
  const yesterday = utcDate(readAt - 86_400_000)
  const closed = days.filter((d) => d.date < today)
  return {
    since: SINCE,
    readAt: new Date(readAt).toISOString(),
    source: 'Cloudflare zone analytics for escorpio.pro, by UTC day',
    days,
    totals: {
      pageViews: days.reduce((s, d) => s + d.pageViews, 0),
      requests: days.reduce((s, d) => s + d.requests, 0),
    },
    today: days.find((d) => d.date === today) ?? null,
    yesterday: days.find((d) => d.date === yesterday) ?? null,
    busiest: closed.reduce<Day | null>((b, d) => (!b || d.pageViews > b.pageViews ? d : b), null),
    notes: [
      'pageViews: HTML page loads, people and bots alike.',
      'visitors: unique IP addresses per UTC day, bots and crawlers included. Not addable across days.',
      'requests: every request to escorpio.pro, including pictures, scripts and API calls.',
      'Today is still counting.',
    ],
  }
}

// Agent use: MCP and API calls Escorpio counts itself (server/usage.ts) in Workers Analytics Engine, read back with
// its SQL API. Only calls from outside the site; the site's own reads are tagged "site" and left out. Analytics
// Engine keeps 90 days and samples only at volumes far above Escorpio's, so SUM(_sample_interval) is the exact count.
export const ACCOUNT_ID = '7a4c344a228f90412b1b09e956bc8662' // not a secret
const USAGE_SQL = `SELECT blob1 AS kind, blob2 AS name, blob3 AS client, formatDateTime(timestamp, '%Y-%m-%d') AS day,
  SUM(_sample_interval) AS calls FROM escorpio_usage WHERE blob4 = 'outside' AND timestamp > NOW() - INTERVAL '90' DAY
  GROUP BY kind, name, client, day ORDER BY day FORMAT JSON`

export type UsageRow = { kind: string; name: string; client: string; day: string; calls: number }
export type Usage = {
  since: string | null
  days: { date: string; mcp: number; api: number }[]
  totals: { toolCalls: number; mcpRequests: number; connections: number; api: number }
  tools: { name: string; calls: number }[]
  clients: { name: string; connections: number }[]
  paths: { path: string; calls: number }[]
}

export async function fetchUsage(token: string, signal?: AbortSignal, f: typeof fetch = fetch): Promise<UsageRow[]> {
  const res = await f(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/analytics_engine/sql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: USAGE_SQL,
    signal,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Analytics Engine answered ${res.status}${text.includes('uthentication') ? ' (token lacks Account Analytics Read)' : ''}`)
  const j = JSON.parse(text) as { data?: Record<string, unknown>[] }
  if (!Array.isArray(j.data)) throw new Error('Analytics Engine sent no rows')
  return j.data.map((r) => ({
    kind: String(r.kind ?? ''),
    name: String(r.name ?? ''),
    client: String(r.client ?? ''),
    day: String(r.day ?? ''),
    calls: count(r.calls),
  }))
}

const top = (m: Map<string, number>, n = 6) =>
  [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n)

export function summarizeUsage(rows: UsageRow[]): Usage {
  const byDay = new Map<string, { mcp: number; api: number }>()
  const tools = new Map<string, number>()
  const clients = new Map<string, number>()
  const paths = new Map<string, number>()
  const totals = { toolCalls: 0, mcpRequests: 0, connections: 0, api: 0 }
  for (const r of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.day)) continue
    const d = byDay.get(r.day) ?? { mcp: 0, api: 0 }
    if (r.kind === 'mcp') {
      d.mcp += r.calls
      totals.mcpRequests += r.calls
      if (r.name.startsWith('tool:')) {
        totals.toolCalls += r.calls
        tools.set(r.name.slice(5), (tools.get(r.name.slice(5)) ?? 0) + r.calls)
      }
      if (r.name === 'initialize') {
        totals.connections += r.calls
        const c = r.client || 'unnamed'
        clients.set(c, (clients.get(c) ?? 0) + r.calls)
      }
    } else if (r.kind === 'api') {
      d.api += r.calls
      totals.api += r.calls
      paths.set(r.name, (paths.get(r.name) ?? 0) + r.calls)
    } else continue
    byDay.set(r.day, d)
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }))
  return {
    since: days[0]?.date ?? null,
    days,
    totals,
    tools: top(tools).map(([name, calls]) => ({ name, calls })),
    clients: top(clients).map(([name, connections]) => ({ name, connections })),
    paths: top(paths).map(([path, calls]) => ({ path, calls })),
  }
}

type Ctx = { waitUntil(p: Promise<unknown>): void }
const CACHE_KEY = 'https://escorpio.pro/__cache/traffic-v2'
const edgeCache = () => (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default
let memory: { body: string; at: number } | undefined

// The JSON body of /api/stats, at most 10 minutes old.
export async function readTraffic(ctx: Ctx, token: string): Promise<string> {
  const now = Date.now()
  if (memory && now - memory.at < STATS_FRESH_MS) return memory.body
  const cache = edgeCache()
  const hit = await cache?.match(CACHE_KEY)
  if (hit) {
    const at = Number(hit.headers.get('x-read-at'))
    if (now - at < STATS_FRESH_MS) return (memory = { body: await hit.text(), at }).body
  }
  // Traffic must answer; agent use is extra and may be off (the token needs Account Analytics Read for it).
  const [days, usage] = await Promise.all([
    fetchTraffic(token, AbortSignal.timeout(10_000)),
    fetchUsage(token, AbortSignal.timeout(10_000)).then(
      (rows) => summarizeUsage(rows),
      (e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }),
    ),
  ])
  const body = JSON.stringify({ ...summarize(days, now), usage }, null, 2) + '\n'
  memory = { body, at: now }
  if (cache)
    ctx.waitUntil(
      cache.put(CACHE_KEY, new Response(body, { headers: { 'content-type': 'application/json', 'x-read-at': String(now), 'cache-control': 'max-age=900' } })),
    )
  return body
}
