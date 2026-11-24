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
