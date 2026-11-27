// Proves the second source for vault sizes (server/onchain.ts): Morpho's dollar size and the vault contract's own
// totalAssets() on Robinhood Chain agree, a vault whose numbers differ is flagged, and a chain outage leaves the API
// answering with "checked: false" instead of failing. Also that the agent tells checkers they can simulate with any
// USDG holder's address. Run: npm run check:onchain
import assert from 'node:assert/strict'
import { createPublicClient, custom, HttpRequestError } from 'viem'
import { headlineVaults } from '../src/data/desk.ts'
import { fetchMorpho, parseDesk, type Vault } from '../src/data/morpho.ts'
import { robinhood } from '../src/lib/chain.ts'
import { about, rates, readDesk, vaultOut } from '../server/api.ts'
import { callAgentTool } from '../server/agent.ts'
import { agrees, chainSummary, checkVaults } from '../server/onchain.ts'
import { serverClient } from '../server/rpc.ts'

// 1. The agreement rule, on the gaps measured 2026-11-27 (Morpho 0.01% above the chain) and on real disagreements.
assert.ok(agrees(559_708_197, 559_652_276), 'the biggest vault, 0.01% apart, agrees')
assert.ok(agrees(7, 7.4), 'a $7 vault a few cents apart agrees')
assert.ok(!agrees(1_000_000, 900_000), 'a 10% gap disagrees')
assert.ok(!agrees(100, 0), 'a vault the chain says is empty disagrees')
console.log('ok agreement rule')

// 2. A chain outage: the check throws, the summary says it was not checked, and a vault row carries onChain: null.
const down = createPublicClient({
  chain: robinhood,
  transport: custom({ request: async () => { throw new HttpRequestError({ url: 'https://rpc.test', status: 429, details: 'Too Many Requests' }) } }, { retryCount: 0 }),
})
const live = parseDesk(await fetchMorpho(), Date.now())
await assert.rejects(checkVaults(down, live.vaults), /did not answer/)
const none = chainSummary(undefined, 'Robinhood Chain did not answer')
assert.equal(none.checked, false)
assert.equal(vaultOut(live.vaults[0], live.readAt).onChain, null)
assert.equal(about(live).checkedOnChain.checked, false, 'a reading without a chain check says so')
console.log('ok outage: checked false, onChain null, API still answers')

// 3. A vault whose Morpho size does not match the chain is flagged (a real vault, its Morpho size inflated 10x).
const providers = { RPC_ALCHEMY: process.env.ROBINHOOD_RPC_ALCHEMY, RPC_CHAINSTACK: process.env.ROBINHOOD_RPC_CHAINSTACK }
if (providers.RPC_ALCHEMY || providers.RPC_CHAINSTACK) {
  const pc = serverClient(providers)
  const big = [...live.vaults].sort((a, b) => b.totalUsd - a.totalUsd)[0]
  const fake: Vault = { ...big, totalUsd: big.totalUsd * 10 }
  const bad = await checkVaults(pc, [fake])
  assert.equal(bad.vaults[big.address.toLowerCase()]?.agreesWithMorpho, false, 'inflated size flagged')

  // 4. Live: every vault is read, holds USDG, and Morpho's size agrees with the chain.
  const ok = await checkVaults(pc, live.vaults)
  const s = chainSummary(ok)
  assert.ok(s.checked && s.vaultsRead === live.vaults.length, `read ${'vaultsRead' in s ? s.vaultsRead : 0} of ${live.vaults.length}`)
  assert.ok(Object.values(ok.vaults).every((c) => c?.assetIsUsdg), 'every vault holds USDG')
  const off = live.vaults.filter((v) => !ok.vaults[v.address.toLowerCase()]?.agreesWithMorpho)
  assert.equal(off.length, 0, `disagree: ${off.map((v) => `${v.name} morpho ${v.totalUsd} chain ${ok.vaults[v.address.toLowerCase()]?.totalUsdg}`).join('; ')}`)
  console.log(`ok live: ${s.vaultsRead} vaults read on chain, ${s.agree} agree with Morpho, inflated size flagged`)

  // 5. End to end through the API reader with the same env the Pages Function gets.
  const d = await readDesk({ request: new Request('https://escorpio.pro/api/rates'), waitUntil: () => {}, env: providers })
  const r = rates(d)
  assert.equal(r.checkedOnChain.checked, true, 'rates carries the chain check')
  assert.equal(r.bestOpenVault?.onChain?.agreesWithMorpho, true, 'best open vault agrees on chain')
  console.log(`ok /api/rates: checkedOnChain ${JSON.stringify({ agree: 'agree' in r.checkedOnChain ? r.checkedOnChain.agree : 0, of: live.vaults.length })}`)
} else {
  console.log('live chain check skipped (no ROBINHOOD_RPC_* in the environment)')
}

// 6. Without a wallet the agent says any USDG holder's address can be used to simulate, with no funds or key.
const open = headlineVaults(live)[0]
const noWallet = (await callAgentTool('prepare_deposit', { vault: open.address, amount_usdg: '10' }, async () => live, down)).structuredContent as { summary: string }
assert.match(noWallet.summary, /Any address that holds USDG works as wallet/)
assert.match(noWallet.summary, /exact-amount approval/)
console.log('ok agent: no-wallet answer explains how to simulate without funds')
