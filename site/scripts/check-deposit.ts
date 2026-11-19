// Proves the deposit and withdraw calls against the real Robinhood Chain contracts without moving money: eth_call
// with the same USDG state override the deposit dialog uses (usdgOverride: balances at slot 1, allowances at slot 3)
// to give a made-up address USDG and an allowance. Run: npm run check:deposit
import assert from 'node:assert/strict'
import { decodeFunctionResult, encodeFunctionData, parseAbiItem, parseUnits, type Address } from 'viem'
import { USDG, fetchDesk } from '../src/data/morpho.ts'
import { vaultNotes } from '../src/data/desk.ts'
import { publicClient as pc } from '../src/lib/chain.ts'
import { erc20Abi, readPosition, simulateDeposit, simulateRedeemAll, simulateWithdraw, usdgOverride, vaultAssetIsUsdg } from '../src/lib/vault-tx.ts'

const ME: Address = '0x000000000000000000000000000000000000e5c0'
const amount = parseUnits('100', 6)
const fund = (vault: Address, allowance: bigint) => usdgOverride(ME, vault, allowance, amount)

// 1. The override slots are still right: balance and allowance read back what was written (if Paxos ever changes the
// USDG layout, this fails here instead of the dialog quietly simulating against nothing).
const v0 = '0xBeEff033F34C046626B8D0A041844C5d1A5409dd' as Address
for (const [fn, args] of [['balanceOf', [ME]], ['allowance', [ME, v0]]] as const) {
  const { data } = await pc.call({ to: USDG, data: encodeFunctionData({ abi: erc20Abi, functionName: fn, args: args as never }), stateOverride: fund(v0, amount) })
  assert.equal(decodeFunctionResult({ abi: erc20Abi, functionName: fn, data: data! }), amount, `${fn} override did not take`)
}
const before = await readPosition(pc, ME, v0)
assert.equal(before.usdg, 0n, 'test address should really hold nothing')

// 2. Every open vault the Earn page would offer: deposit 100 USDG passes with the exact allowance, fails without it.
const desk = await fetchDesk()
const open = desk.vaults.filter((v) => v.totalUsd >= 1_000 && !vaultNotes(v, desk.readAt).some((n) => n.stop))
let ok = 0
for (const v of open) {
  const vault = v.address as Address
  assert.ok(await vaultAssetIsUsdg(pc, vault), `${v.name}: asset is not USDG`)
  const { result: shares } = await simulateDeposit(pc, ME, vault, amount, fund(vault, amount))
  assert.ok(shares > 0n, `${v.name}: no shares`)
  await assert.rejects(simulateDeposit(pc, ME, vault, amount, fund(vault, amount - 1n)), `${v.name}: deposit passed with too small an allowance`)
  ok++
  console.log(`ok deposit  ${v.name.padEnd(32)} 100 USDG -> ${shares} shares`)
}
assert.ok(ok > 0, 'no open vault to test')

// 3. Withdraw: a real current holder of the biggest open vault can redeem all their shares (found in recent Transfer
// logs; the public RPC returns at most 10,000 logs per call, so the window widens until it finds some).
const w = [...open].sort((a, b) => b.totalUsd - a.totalUsd)[0]
const wv = w.address as Address
const head = await pc.getBlockNumber()
let logs: Awaited<ReturnType<typeof getTransfers>> = []
const getTransfers = (from: bigint) =>
  pc.getLogs({ address: wv, event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'), fromBlock: from, toBlock: head })
for (const span of [50_000n, 500_000n, 5_000_000n, 50_000_000n]) {
  logs = await getTransfers(head > span ? head - span : 0n)
  if (logs.length >= 5) break
}
const holders = [...new Set(logs.map((l) => l.args.to!).filter((a) => a && !/^0x0{40}$/i.test(a)))].reverse()
let redeemed = false
for (const h of holders.slice(0, 15)) {
  const p = await readPosition(pc, h, wv)
  if (p.shares === 0n || Number(p.inVault) / 1e6 > w.withdrawableUsd) continue
  const { result } = await simulateRedeemAll(pc, h, wv, p.shares)
  console.log(`ok withdraw ${w.name}: holder ${h.slice(0, 8)}… redeems all shares -> ${Number(result) / 1e6} USDG`)
  // A part withdrawal by USDG amount returns the shares it burns (18 decimals), not USDG. The dialog once showed that
  // number as USDG ("you would get 9,890,488,829,576 USDG" for 10 USDG); it must show the amount asked for instead.
  if (p.inVault >= 2n) {
    const part = p.inVault / 2n
    const { result: burned } = await simulateWithdraw(pc, h, wv, part)
    assert.ok(burned > 0n && burned <= p.shares, `${w.name}: withdraw should return shares burned (${burned})`)
    assert.ok(burned > part * 10n ** 6n, `${w.name}: withdraw result looks like USDG, not shares (${burned})`)
  }
  redeemed = true
  break
}
assert.ok(redeemed, 'could not find a holder to test withdraw')
console.log(`deposit check passed: ${ok} open vaults, withdraw ok`)
