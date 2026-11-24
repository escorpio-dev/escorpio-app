// Checks the traffic numbers behind /stats (server/stats.ts): parsing, totals, today/yesterday/busiest, and that bad
// answers are refused rather than shown. With CF_ANALYTICS_TOKEN set it also reads Cloudflare once.
// Run: npm run check:stats
import assert from 'node:assert/strict'
import { SINCE, fetchTraffic, parseGroups, summarize } from '../server/stats.ts'

const g = (date: string, pageViews: number, uniques: number, requests: number) => ({
  dimensions: { date },
  sum: { pageViews, requests },
  uniq: { uniques },
})

// Parsing: sorted by day, days before launch dropped, counts kept as they are.
const days = parseGroups([g('2026-11-23', 3645, 340, 6934), g('2026-11-22', 1024, 329, 2465), g('2026-11-21', 5, 1, 9), g('2026-11-24', 726, 198, 2322)])
assert.deepEqual(days.map((d) => d.date), ['2026-11-22', '2026-11-23', '2026-11-24'])
assert.deepEqual(days[0], { date: '2026-11-22', pageViews: 1024, visitors: 329, requests: 2465 })
assert.equal(SINCE, '2026-11-22')

// Summary on 24 Nov: today still counting, busiest only among full days, totals add page views and requests only.
const s = summarize(days, Date.parse('2026-11-24T15:00:00Z'))
assert.equal(s.totals.pageViews, 1024 + 3645 + 726)
assert.equal(s.totals.requests, 2465 + 6934 + 2322)
assert.equal(s.today?.date, '2026-11-24')
assert.equal(s.yesterday?.visitors, 340)
assert.equal(s.busiest?.date, '2026-11-23')
assert.ok(!('visitors' in s.totals), 'visitors are never added up across days')

// A day with a huge count today is not "busiest" until the day is over.
assert.equal(summarize(parseGroups([g('2026-11-22', 10, 1, 10), g('2026-11-24', 999, 1, 999)]), Date.parse('2026-11-24T10:00:00Z')).busiest?.date, '2026-11-22')
// First day: nothing full yet.
assert.equal(summarize(parseGroups([g('2026-11-22', 10, 1, 10)]), Date.parse('2026-11-22T10:00:00Z')).busiest, null)

// Bad answers are refused, never shown.
assert.throws(() => parseGroups([g('2026-11-22', -1, 1, 1)]))
assert.throws(() => parseGroups([{ dimensions: { date: '2026-11-22' }, sum: { pageViews: Number.NaN, requests: 1 }, uniq: { uniques: 1 } }]))
const fake = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
await assert.rejects(fetchTraffic('t', undefined, fake(200, { data: null, errors: [{ message: 'not authorized' }] })), /not authorized/)
await assert.rejects(fetchTraffic('t', undefined, fake(403, {})), /403/)
await assert.rejects(fetchTraffic('t', undefined, fake(200, { data: { viewer: { zones: [] } }, errors: null })), /no traffic/)
const ok = await fetchTraffic('t', undefined, fake(200, { data: { viewer: { zones: [{ httpRequests1dGroups: [g('2026-11-22', 1, 1, 1)] }] } }, errors: null }))
assert.equal(ok.length, 1)
console.log('stats logic: ok')

const token = process.env.CF_ANALYTICS_TOKEN
if (token) {
  const live = summarize(await fetchTraffic(token), Date.now())
  assert.ok(live.days.length > 0 && live.days[0].date === SINCE, 'live days start on launch day')
  assert.ok(live.totals.pageViews > 0)
  console.log(`stats live: ok (${live.days.length} days, ${live.totals.pageViews} page views, today ${live.today?.visitors ?? 0} visitors)`)
} else console.log('stats live: skipped (no CF_ANALYTICS_TOKEN)')

// Agent use: what /mcp and /api record (server/usage.ts) and how /api/stats sums it (server/stats.ts).
const { mcpCalls, record, sourceOf } = await import('../server/usage.ts')
const { fetchUsage, summarizeUsage } = await import('../server/stats.ts')
assert.deepEqual(mcpCalls({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'claude-ai' } } }), [{ name: 'initialize', client: 'claude-ai' }])
assert.deepEqual(mcpCalls({ method: 'tools/call', params: { name: 'get_best_rates' } }), [{ name: 'tool:get_best_rates' }])
assert.deepEqual(mcpCalls([{ method: 'tools/list' }, { method: 'notifications/initialized' }, 'junk', { id: 3 }]), [{ name: 'tools/list' }, { name: 'notifications/initialized' }])
assert.deepEqual(mcpCalls({ method: 'initialize', params: {} }), [{ name: 'initialize', client: 'unnamed' }])
assert.equal(mcpCalls({ method: 'tools/call', params: { name: '<script>x' } })[0].name, 'tool:scriptx', 'odd characters dropped')
const points: { blobs?: string[]; indexes?: string[] }[] = []
record({ USAGE: { writeDataPoint: (p) => points.push(p) } }, { kind: 'mcp', name: 'tool:list_vaults', source: 'outside' })
assert.deepEqual(points[0].blobs, ['mcp', 'tool:list_vaults', '', 'outside'])
assert.deepEqual(points[0].indexes, ['mcp'])
record(undefined, { kind: 'api', name: '/api/rates', source: 'site' }) // no binding: records nothing, never throws
record({ USAGE: { writeDataPoint: () => { throw new Error('down') } } }, { kind: 'api', name: '/api/rates', source: 'site' })
assert.equal(sourceOf(new Request('https://escorpio.pro/api/desk', { headers: { 'sec-fetch-site': 'same-origin' } })), 'site')
assert.equal(sourceOf(new Request('https://escorpio.pro/api/desk')), 'outside')

const u = summarizeUsage([
  { kind: 'mcp', name: 'initialize', client: 'claude-ai', day: '2026-11-25', calls: 3 },
  { kind: 'mcp', name: 'initialize', client: 'cursor', day: '2026-11-25', calls: 1 },
  { kind: 'mcp', name: 'tools/list', client: '', day: '2026-11-25', calls: 4 },
  { kind: 'mcp', name: 'tool:get_best_rates', client: '', day: '2026-11-25', calls: 5 },
  { kind: 'mcp', name: 'tool:list_markets', client: '', day: '2026-11-26', calls: 2 },
  { kind: 'api', name: '/api/rates', client: '', day: '2026-11-26', calls: 7 },
  { kind: 'other', name: 'x', client: '', day: '2026-11-26', calls: 99 },
  { kind: 'mcp', name: 'tool:x', client: '', day: 'bad', calls: 99 },
])
assert.equal(u.since, '2026-11-25')
assert.deepEqual(u.totals, { toolCalls: 7, mcpRequests: 15, connections: 4, api: 7 })
assert.deepEqual(u.days, [{ date: '2026-11-25', mcp: 13, api: 0 }, { date: '2026-11-26', mcp: 2, api: 7 }])
assert.deepEqual(u.tools[0], { name: 'get_best_rates', calls: 5 })
assert.deepEqual(u.clients, [{ name: 'claude-ai', connections: 3 }, { name: 'cursor', connections: 1 }])
assert.equal(summarizeUsage([]).since, null)
const fakeText = (status: number, body: string) => (async () => new Response(body, { status })) as unknown as typeof fetch
assert.deepEqual(await fetchUsage('t', undefined, fakeText(200, JSON.stringify({ data: [{ kind: 'mcp', name: 'initialize', client: 'c', day: '2026-11-25', calls: '2' }] }))), [{ kind: 'mcp', name: 'initialize', client: 'c', day: '2026-11-25', calls: 2 }])
await assert.rejects(fetchUsage('t', undefined, fakeText(401, 'Authentication error')), /Account Analytics Read/)
await assert.rejects(fetchUsage('t', undefined, fakeText(200, '{}')), /no rows/)
console.log('usage logic: ok')
if (token) {
  const rows = await fetchUsage(token)
  console.log(`usage live: ok (${rows.length} rows)`)
} else console.log('usage live: skipped (no CF_ANALYTICS_TOKEN)')
