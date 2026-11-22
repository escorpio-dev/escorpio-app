// Checks the desk logic twice: on hand-made rows (exact answers known) and on a live read of the Morpho API
// (shape and sanity). Run: npm run check
import assert from 'node:assert/strict'
import { cheapest, collaterals, headlineVaults, marketNotes, sharedSymbols, vaultNotes, widestGap, yearly } from '../src/data/desk.ts'
import { USDG, fetchDesk, parseDesk } from '../src/data/morpho.ts'

const now = Date.UTC(2026, 10, 19) // 19 Nov 2026
const old = now / 1000 - 90 * 86_400
const NVDA = '0x00000000000000000000000000000000000000a1'
const FAKE_NVDA = '0x00000000000000000000000000000000000000b2'
const hid = (c: string) => '0x' + c.repeat(64) // fixture market ids: valid 32-byte hex
const mk = (id: string, col: string, sym: string, apy: number, supply: number, avail: number, lltv = '625000000000000000', warnings: unknown[] = []) => ({
  marketId: hid(id),
  lltv,
  creationTimestamp: old,
  listed: true,
  collateralAsset: { symbol: sym, name: sym, address: col },
  state: { borrowApy: apy, supplyApy: apy * 0.8, supplyAssetsUsd: supply, borrowAssetsUsd: supply - avail, liquidityAssetsUsd: avail, utilization: 1 - avail / supply },
  warnings,
})
let n = 0
const vk = (name: string, asset: string, apy: number, total: number, liq: number, extra: Record<string, unknown> = {}) => ({
  name,
  address: '0x' + (++n).toString(16).padStart(40, '0'),
  listed: true,
  netApy: apy,
  totalAssetsUsd: total,
  liquidityUsd: liq,
  performanceFee: 0,
  managementFee: 0,
  creationTimestamp: old,
  asset: { address: asset },
  curators: { items: [{ name: 'Curator' }] },
  warnings: [],
  ...extra,
})
const desk = parseDesk(
  {
    data: {
      markets: {
        pageInfo: { countTotal: 6 },
        items: [
          mk('a', NVDA, 'NVDA', 0.2062, 484_000, 104_000),
          mk('b', NVDA, 'NVDA', 0.0151, 236_000, 23_000),
          mk('c', NVDA, 'NVDA', 0.0203, 38_000, 2_000),
          mk('d', NVDA, 'NVDA', 0.01, 50_000, 40_000, '770000000000000000'),
          mk('e', FAKE_NVDA, 'NVDA', 0.001, 20_000, 20_000),
          mk('f', NVDA, 'NVDA', 0.005, 500, 500), // too small for the gap
        ],
      },
      vaultV2s: {
        items: [
          vk('Closed big', USDG, 0.06, 500_000_000, 70_000_000, { warnings: [{ type: 'deposit_disabled', level: 'RED' }] }),
          vk('Open', USDG, 0.0479, 67_000, 58_000),
          vk('Steady big', USDG, 0.0339, 208_000, 205_000),
          vk('Stuck', USDG, 0.13, 641_000, 0, { listed: false }),
          vk('Fake USDG', '0x66402e9d09522E86a817b1940b32db1551F3041C', 0.5, 9_000_000, 9_000_000),
        ],
      },
    },
  },
  now,
)

// Fake "USDG" vault is dropped; closed and stuck vaults never make the headline.
assert.equal(desk.vaults.length, 4)
assert.deepEqual(headlineVaults(desk).map((v) => v.name), ['Open', 'Steady big'])
assert.ok(vaultNotes(desk.vaults[0], now).some((x) => x.stop && x.text === 'Deposits closed'))
assert.ok(vaultNotes(desk.vaults[3], now).some((x) => x.stop))
// Same symbol, two contracts: two groups, and the symbol is flagged.
const groups = collaterals(desk, 0)
assert.equal(groups.filter((g) => g.symbol === 'NVDA').length, 2)
assert.ok(sharedSymbols(groups).has('NVDA'))
// Cheapest loan that can actually lend the amount.
const real = groups.find((g) => g.address === NVDA)!
assert.equal(cheapest(real, 0, now)?.id, hid('d')) // 1.00% at 77% LLTV
assert.equal(cheapest(real, 30_000, now)?.id, hid('d'))
assert.equal(cheapest(real, 50_000, now)?.id, hid('a')) // only market with $50k free
assert.equal(cheapest(real, 200_000, now), undefined)
// Widest gap compares the same collateral at the same LLTV only: 20.62% vs 1.51%.
const gap = widestGap(desk)!
assert.equal(gap.low.id, hid('b'))
assert.equal(gap.high.id, hid('a'))
assert.equal(gap.lltv, 0.625)
assert.equal(Math.round(gap.points * 100) / 100, 19.11)
assert.equal(Math.round(yearly(10_000, 0.0479) * 100) / 100, 479)
assert.ok(marketNotes(desk.markets[5], now).some((x) => x.text.startsWith('Small market')))
// Malformed rows are dropped, not shown as 0%: bad market id, missing rate, broken address, missing vault rate.
const bad = parseDesk(
  {
    data: {
      markets: {
        items: [
          mk('a', NVDA, 'NVDA', 0.02, 10_000, 5_000),
          { ...mk('b', NVDA, 'NVDA', 0.02, 10_000, 5_000), marketId: 'not-an-id' },
          { ...mk('c', NVDA, 'NVDA', 0.02, 10_000, 5_000), state: { supplyApy: 0.01 } },
          mk('d', '0x123', 'NVDA', 0.02, 10_000, 5_000),
          mk('e', NVDA, 'NVDA', 0.02, 10_000, 5_000, '1000000000000000000'),
        ],
      },
      vaultV2s: { items: [vk('Good', USDG, 0.04, 1_000, 1_000), vk('', USDG, 0.03, 1_000, 1_000), vk('No rate', USDG, NaN, 1_000, 1_000), { ...vk('x', USDG, 0.04, 1, 1), address: 'nope' }] },
    },
  },
  now,
)
assert.deepEqual(bad.markets.map((x) => x.id), [hid('a')])
assert.equal(bad.vaults.length, 2)
assert.equal(bad.vaults[0].name, 'Good')
assert.match(bad.vaults[1].name, /^Unnamed vault 0x0000…00[0-9a-f]{2}$/)
assert.throws(() => parseDesk({ data: { markets: {} } }, now), /unexpected answer/)
console.log('fixture checks: ok')

// Live read: shape and sanity only (the numbers move).
const live = await fetchDesk()
assert.ok(live.markets.length > 10, 'expected USDG markets')
assert.ok(live.vaults.length > 5, 'expected USDG vaults')
for (const m of live.markets) {
  assert.ok(m.lltv > 0 && m.lltv < 1, `lltv ${m.id}`)
  assert.ok(m.borrowApy >= 0, `apy ${m.id}`)
}
const top = headlineVaults(live)[0]
const g = widestGap(live)
console.log(`live: ${live.markets.length} USDG markets (${live.marketCount} counted by Morpho), ${live.vaults.length} USDG vaults`)
if (top) console.log(`best open vault: ${top.name} ${(top.netApy * 100).toFixed(2)}% ($${Math.round(top.totalUsd)})`)
if (g) console.log(`widest gap: ${g.collateral.symbol} @ ${g.lltv * 100}% LLTV, ${(g.low.borrowApy * 100).toFixed(2)}% vs ${(g.high.borrowApy * 100).toFixed(2)}% = ${g.points.toFixed(2)} pts`)
console.log('shared symbols:', [...sharedSymbols(collaterals(live))].join(', ') || 'none')
