// Proves the agent tools (server/agent.ts) against a live Morpho read and the real contracts on Robinhood Chain,
// without moving money: links round trip into the pages' readers, bad input is refused, an empty wallet is blocked
// with the same sentence the site shows, a real USDG holder's deposit simulates, loan limits hold, payment requests
// and payment checks work. Plus the shared loan plan on a hand-made loan. Run: npm run check:agent
import assert from 'node:assert/strict'
import { createPublicClient, custom, HttpRequestError, parseAbiItem, parseUnits, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { vaultNotes, marketNotes } from '../src/data/desk.ts'
import { USDG, fetchMorpho, parseDesk } from '../src/data/morpho.ts'
import { readLoanLink, readReceiveLink, readVaultLink } from '../src/lib/action-link.ts'
import { publicClient as pc, robinhood } from '../src/lib/chain.ts'
import { LOAN_CAP, loanBlock, loanPlan, withMargin, type Loan } from '../src/lib/loan-tx.ts'
import { newRef, toQuery, typedData } from '../src/lib/receive.ts'
import { erc20Abi } from '../src/lib/vault-tx.ts'
import { AGENT_TOOLS, callAgentTool } from '../server/agent.ts'
import { handle } from '../server/mcp.ts'

const live = parseDesk(await fetchMorpho(), Date.now())
const desk = async () => live
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tool = async (name: string, args: Record<string, unknown>): Promise<any> => (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, desk))!.result
const empty = privateKeyToAccount(generatePrivateKey()).address
// A call that must answer with data: an error here (for example the RPC not answering) fails with its own text.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data = async (name: string, args: Record<string, unknown>): Promise<any> => {
  const r = await tool(name, args)
  assert.ok(!r.isError && r.structuredContent, `${name}: ${r.content?.[0]?.text}`)
  return r.structuredContent
}

// 1. Listed, and every one is marked read-only (none can change anything).
const list = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, desk))!.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] }
for (const t of AGENT_TOOLS) assert.ok(list.tools.some((x) => x.name === t.name && x.annotations.readOnlyHint), `${t.name} listed read-only`)

// 2. Deposit: link round trip, refusals, empty wallet, real holder.
const open = live.vaults.filter((v) => v.totalUsd >= 1_000 && !vaultNotes(v, live.readAt).some((n) => n.stop)).sort((a, b) => b.totalUsd - a.totalUsd)
const vault = open[0]
assert.ok(vault, 'an open vault')
const dep = await tool('prepare_deposit', { vault: vault.address, amount_usdg: '25' })
assert.ok(!dep.isError, dep.content?.[0]?.text)
assert.deepEqual(readVaultLink(new URL(dep.structuredContent.open_url).search), { vault: vault.address, action: 'deposit', amount: '25' })
assert.equal((await tool('prepare_deposit', { vault: empty, amount_usdg: '25' })).isError, true, 'unknown vault accepted')
assert.equal((await tool('prepare_deposit', { vault: vault.address, amount_usdg: '1.1234567' })).isError, true, '7 decimals accepted')
assert.equal((await tool('prepare_deposit', { vault: vault.address, amount_usdg: '0' })).isError, true, '0 accepted')
assert.equal((await tool('prepare_deposit', { vault: vault.address, amount_usdg: 'all' })).isError, true, 'deposit all accepted')
assert.equal((await tool('prepare_deposit', { vault: vault.address, amount_usdg: '5', wallet: 'me' })).isError, true, 'bad wallet accepted')
assert.equal((await tool('prepare_deposit', { vault: vault.address, amount_usdg: '5', to: empty })).isError, true, 'unknown argument accepted')
const stopped = live.vaults.find((v) => vaultNotes(v, live.readAt).some((n) => n.stop))
if (stopped) assert.equal((await tool('prepare_deposit', { vault: stopped.address, amount_usdg: '5' })).isError, true, 'deposit into a stop vault accepted')
const broke = (await data('prepare_deposit', { vault: vault.address, amount_usdg: '25', wallet: empty }))
assert.equal(broke.blocked, 'Your wallet holds 0.00 USDG.')
assert.equal(broke.simulation, undefined, 'simulated a blocked deposit')

// A plain wallet that holds USDG and ETH right now, found from recent USDG transfers.
const head = await pc.getBlockNumber()
const logs = await pc.getLogs({ address: USDG as Address, event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'), fromBlock: head - 2_000n, toBlock: head })
let holder: Address | undefined
const seen = new Set<string>()
for (const l of logs.reverse()) {
  for (const a of [l.args.to!, l.args.from!]) {
    if (holder || seen.has(a) || seen.size > 120) continue
    seen.add(a)
    const [code, bal, eth] = await Promise.all([pc.getCode({ address: a }), pc.readContract({ address: USDG as Address, abi: erc20Abi, functionName: 'balanceOf', args: [a] }), pc.getBalance({ address: a })])
    if ((!code || code === '0x') && bal >= parseUnits('30', 6) && eth > 0n) holder = a
  }
}
assert.ok(holder, 'no USDG holder found in recent transfers')
const real = (await data('prepare_deposit', { vault: vault.address, amount_usdg: '25', wallet: holder }))
assert.equal(real.blocked, undefined, real.blocked)
assert.equal(real.simulation.passed, true, real.simulation.why)
assert.ok(real.steps.at(-1).startsWith('Deposit 25.00 USDG'), real.steps.join(' / '))
assert.ok(real.steps.length === 1 || real.steps[0].includes('exactly 25.00 USDG'), 'approval is not exact')

// 3. Withdraw: "all" from a wallet with nothing in the vault.
const wAll = await tool('prepare_withdraw', { vault: vault.address, amount_usdg: 'all', wallet: empty })
assert.equal(wAll.structuredContent.blocked, 'This wallet has nothing in this vault.')
assert.equal(readVaultLink(new URL(wAll.structuredContent.open_url).search)?.amount, 'all')

// 4. Loans: link round trip, empty wallet, nothing to repay, stop markets.
const market = [...live.markets].filter((m) => !marketNotes(m, live.readAt).some((n) => n.stop) && m.availableUsd > 1_000).sort((a, b) => b.supplyUsd - a.supplyUsd)[0]
assert.ok(market, 'an open market')
const bor = await tool('prepare_borrow', { market_id: market.id, collateral_amount: '1', borrow_usdg: '10' })
assert.ok(!bor.isError, bor.content?.[0]?.text)
assert.deepEqual(readLoanLink(new URL(bor.structuredContent.open_url).search), { market: market.id, action: 'borrow', collateral: '1', usdg: '10' })
assert.equal((await tool('prepare_borrow', { market_id: market.id })).isError, true, 'borrow of nothing accepted')
assert.equal((await tool('prepare_borrow', { market_id: `0x${'ab'.repeat(32)}`, borrow_usdg: '5' })).isError, true, 'unknown market accepted')
const sym = market.collateral.symbol
const borBroke = (await data('prepare_borrow', { market_id: market.id, collateral_amount: '1', borrow_usdg: '10', wallet: empty }))
assert.ok(borBroke.blocked?.startsWith('Your wallet holds 0'), borBroke.blocked)
assert.ok(borBroke.blocked.endsWith(`${sym}.`), borBroke.blocked)
// Borrowing with no collateral at all is past the cap.
const noColl = (await data('prepare_borrow', { market_id: market.id, borrow_usdg: '10', wallet: empty }))
assert.ok(noColl.blocked?.includes(`past ${LOAN_CAP}% of the liquidation line`), noColl.blocked)
assert.equal((await data('prepare_repay', { market_id: market.id, amount_usdg: 'all', wallet: empty })).blocked, 'This wallet owes nothing in this market.')
assert.equal((await data('prepare_repay', { market_id: market.id, amount_usdg: '5', wallet: empty })).blocked, 'You owe nothing in this market.')
assert.ok((await data('prepare_collateral_withdraw', { market_id: market.id, collateral_amount: '1', wallet: empty })).blocked.startsWith('You have 0'))
const stopMarket = live.markets.find((m) => marketNotes(m, live.readAt).some((n) => n.stop))
if (stopMarket) assert.equal((await tool('prepare_borrow', { market_id: stopMarket.id, borrow_usdg: '5' })).isError, true, 'new loan in a stop market accepted')

// 5. The shared loan plan (site dialog and agent) on a hand-made loan: 1 token worth 1,000 USDG, 80% line.
const fake: Loan = {
  params: { loanToken: USDG as Address, collateralToken: empty, oracle: empty, irm: empty, lltv: parseUnits('0.8', 18) },
  collSymbol: 'TEST', collDecimals: 18,
  price: 1000n * 10n ** 6n * 10n ** 36n / 10n ** 18n, // USDG raw per collateral raw, scaled 1e36
  collateral: 0n, borrowShares: 0n, debt: 0n,
  walletColl: parseUnits('1', 18), collAllowance: 0n, walletUsdg: 0n, usdgAllowance: 0n, eth: 1n,
}
// Line = 800 USDG; Escorpio stops at 90% of it = 720.
assert.equal(loanBlock(fake, 'borrow', parseUnits('1', 18), parseUnits('720', 6)), undefined, '720 of 800 refused')
assert.ok(loanBlock(fake, 'borrow', parseUnits('1', 18), parseUnits('721', 6))?.includes('up to 720.00 USDG'), '721 of 800 allowed')
assert.deepEqual(loanPlan(fake, 'borrow', parseUnits('1', 18), parseUnits('500', 6)).steps.map((s) => s.key), ['approve', 'supply', 'borrow'])
const owing = { ...fake, collateral: parseUnits('1', 18), debt: parseUnits('500', 6), borrowShares: 5n, walletUsdg: parseUnits('600', 6) }
const all = loanPlan(owing, 'repay', 0n, owing.debt)
assert.equal(all.repayAll, true)
assert.equal(all.repayPull, withMargin(owing.debt))
assert.deepEqual(all.steps.map((s) => s.key), ['approve', 'repay'])
assert.ok(loanBlock(owing, 'collateral', parseUnits('0.5', 18), 0n)?.includes('Repay first'), 'took collateral back past the cap')

// 6. Payment requests and payment checks.
const pr = (await data('prepare_payment_request', { amount_usdg: '100', memo: 'Logo design', valid_days: 7 }))
assert.deepEqual(readReceiveLink(new URL(pr.open_url).search), { amount: '100', memo: 'Logo design', days: 7 })
assert.equal((await tool('prepare_payment_request', { amount_usdg: '100', memo: 'x'.repeat(121) })).isError, true, 'long memo accepted')
assert.equal((await tool('prepare_payment_request', { amount_usdg: '100', valid_days: 3 })).isError, true, '3 days accepted')
assert.equal(readVaultLink('vault=0x1&action=deposit&amount=5'), undefined)
assert.equal(readLoanLink(`market=${market.id}&action=borrow&usdg=all`), undefined, 'borrow all accepted')

const tx = logs.find((l) => l.args.value! > 0n)!
const payee = privateKeyToAccount(generatePrivateKey())
const req = { to: payee.address, amount: tx.args.value!, memo: '', ref: newRef(), expires: 0n }
const link = `https://escorpio.pro/pay?${toQuery({ ...req, sig: await payee.signTypedData(typedData(req)) })}`
const chk = (await data('check_payment', { tx_hash: tx.transactionHash, payment_link: link }))
assert.equal(chk.found, true)
assert.equal(chk.request.signedByPayee, true)
assert.equal(chk.paid, false, 'a transfer to someone else counted as paid')
const plain = (await data('check_payment', { tx_hash: tx.transactionHash }))
assert.ok(plain.usdgTransfers.length > 0)
assert.equal((await tool('check_payment', { tx_hash: `0x${'00'.repeat(32)}` })).structuredContent.found, false)
assert.equal((await tool('check_payment', { tx_hash: tx.transactionHash, payment_link: 'not a link' })).isError, true)

// 7. Escorpio's server cannot reach the RPC (Cloudflare egress is refused with "Too Many Requests"): every tool still
// answers with its link, says it was not simulated there, and never reports a block or a missing payment it did not read.
const down = createPublicClient({
  chain: robinhood,
  transport: custom({ request: async () => { throw new HttpRequestError({ url: 'https://rpc.test', status: 429, details: 'Too Many Requests' }) } }, { retryCount: 0 }),
})
for (const [name, args] of [
  ['prepare_deposit', { vault: vault.address, amount_usdg: '25', wallet: holder }],
  ['prepare_withdraw', { vault: vault.address, amount_usdg: 'all', wallet: holder }],
  ['prepare_borrow', { market_id: market.id, collateral_amount: '1', borrow_usdg: '10', wallet: holder }],
  ['prepare_repay', { market_id: market.id, amount_usdg: 'all', wallet: holder }],
] as const) {
  const r = await callAgentTool(name, args, desk, down)
  assert.ok(!r.isError, `${name} errored on an outage: ${r.content[0].text}`)
  const o = r.structuredContent!
  assert.ok(String(o.open_url).startsWith('https://escorpio.pro/'), `${name} gave no link on an outage`)
  assert.equal((o.simulation as { passed: null }).passed, null, `${name} claimed a simulation result on an outage`)
  assert.equal(o.blocked, undefined, `${name} reported a block it never read`)
}
const borNoWallet = await callAgentTool('prepare_borrow', { market_id: market.id, borrow_usdg: '10' }, desk, down)
assert.ok(!borNoWallet.isError, 'prepare_borrow without a wallet needed the chain')
const payDown = (await callAgentTool('check_payment', { tx_hash: tx.transactionHash }, desk, down)).structuredContent!
assert.equal(payDown.found, null, 'an outage read as "no such transaction"')

console.log(`ok deposit 25 USDG into ${vault.name} for ${holder.slice(0, 8)}…: ${real.steps.length} step(s), simulation passed`)
console.log(`ok loan limits on ${sym} market ${(market.id as Hex).slice(0, 10)}…, payment request and payment check`)
console.log(`agent check passed: ${AGENT_TOOLS.length} tools`)
