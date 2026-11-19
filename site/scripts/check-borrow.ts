// Proves the borrow steps against the real Morpho Blue contract on Robinhood Chain without moving money: eth_call with
// state overrides that give a made-up address collateral, debt or tokens. Run: npm run check:borrow
import assert from 'node:assert/strict'
import { decodeFunctionResult, encodeAbiParameters, encodeFunctionData, keccak256, numberToHex, parseUnits, type Address, type Hex, type StateOverride } from 'viem'
import { MORPHO_BLUE, fetchDesk } from '../src/data/morpho.ts'
import { collaterals, cheapest, marketNotes } from '../src/data/desk.ts'
import { publicClient as pc } from '../src/lib/chain.ts'
import {
  blueAbi,
  borrowLimit,
  positionOverride,
  readLoan,
  repayMax,
  simulateBorrow,
  simulateRepay,
  simulateSupplyCollateral,
  simulateWithdrawCollateral,
} from '../src/lib/loan-tx.ts'
import { erc20Abi, usdgOverride } from '../src/lib/vault-tx.ts'

const ME: Address = '0x000000000000000000000000000000000000e5c0'
const BLUE = MORPHO_BLUE as Address
// Two overrides on different contracts (Morpho Blue and USDG) in one call.
const merge = (...o: StateOverride[]): StateOverride => {
  const by = new Map<Address, { slot: Hex; value: Hex }[]>()
  for (const e of o.flat()) by.set(e.address, [...(by.get(e.address) ?? []), ...(e.stateDiff ?? [])])
  return [...by].map(([address, stateDiff]) => ({ address, stateDiff }))
}

// The token's own balance and allowance slots, found by writing a value and reading it back (plain mappings at slots
// 0..60, or OpenZeppelin's namespaced ERC20 storage). Only this test needs them; the dialog never overrides a token.
async function tokenSlots(token: Address) {
  const word = (n: bigint) => numberToHex(n, { size: 32 })
  const key = (k: Address, s: bigint | Hex) =>
    keccak256(encodeAbiParameters([{ type: 'address' }, typeof s === 'bigint' ? { type: 'uint256' } : { type: 'bytes32' }], [k, s as never]))
  const read = async (fn: 'balanceOf' | 'allowance', args: readonly unknown[], slot: Hex) => {
    const r = await pc
      .call({ to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: fn, args: args as never }), stateOverride: [{ address: token, stateDiff: [{ slot, value: word(777n) }] }] })
      .catch(() => ({ data: undefined }))
    return r.data ? decodeFunctionResult({ abi: erc20Abi, functionName: fn, data: r.data }) : -1n
  }
  const oz = BigInt('0x52c63247e1f47db19d5ce0460030c497f067ca4cebf71ba98eeadabe20bace00')
  const bases = [...[...Array(61).keys()].map(BigInt), oz, oz + 1n]
  let bal: bigint | undefined, alw: bigint | undefined
  for (const b of bases) {
    if (bal === undefined && (await read('balanceOf', [ME], key(ME, b))) === 777n) bal = b
    if (alw === undefined && (await read('allowance', [ME, BLUE], key(BLUE, key(ME, b)))) === 777n) alw = b
    if (bal !== undefined && alw !== undefined) break
  }
  if (bal === undefined || alw === undefined) return undefined
  return (amount: bigint): StateOverride => [
    { address: token, stateDiff: [{ slot: key(ME, bal!), value: word(amount) }, { slot: key(BLUE, key(ME, alw!)), value: word(amount) }] },
  ]
}

// 0. "Max" on Repay never asks for more USDG than the wallet holds (it once filled the whole 9,002.59 debt for a wallet
// holding 1,177.61, which the dialog then refused).
assert.equal(repayMax({ debt: 9_002_590_000n, walletUsdg: 1_177_610_000n }), 1_177_610_000n)
assert.equal(repayMax({ debt: 100_000_000n, walletUsdg: 500_000_000n }), 100_000_000n)
assert.equal(repayMax({ debt: 0n, walletUsdg: 5n }), 0n)

// 1. The Morpho Blue position override is read back exactly (collateral high half, borrow shares low half).
const desk = await fetchDesk()
const picks = collaterals(desk, 30_000)
  .map((g) => ({ g, m: cheapest(g, 1_000, desk.readAt) }))
  .filter((x) => x.m && !marketNotes(x.m, desk.readAt).some((n) => n.stop))
  .slice(0, 6)
assert.ok(picks.length > 0, 'no open market to test')
{
  const id = picks[0].m!.id as Hex
  const { data } = await pc.call({ to: BLUE, data: encodeFunctionData({ abi: blueAbi, functionName: 'position', args: [id, ME] }), stateOverride: positionOverride(id, ME, 123n, 456n) })
  const p = decodeFunctionResult({ abi: blueAbi, functionName: 'position', data: data! })
  assert.deepEqual([p[1], p[2]], [456n, 123n], 'position override slot is wrong')
}

const amount = parseUnits('100', 6)
let supplied = 0
for (const { g, m } of picks) {
  const id = m!.id as Hex
  const loan = await readLoan(pc, ME, id)
  assert.equal(loan.collateral, 0n)
  // Collateral that makes 100 USDG half of the limit.
  const coll = (amount * 2n * 10n ** 36n * 10n ** 18n) / (loan.price * loan.params.lltv) + 1n
  const limit = borrowLimit(coll, loan.price, loan.params.lltv)
  assert.ok(limit >= amount * 2n - 1n && limit <= amount * 2n + 1n, `${g.symbol}: limit math off (${limit})`)

  // 2. Borrow 100 USDG against that collateral passes; borrowing past the limit is refused by Morpho.
  const { result } = await simulateBorrow(pc, ME, loan.params, amount, positionOverride(id, ME, coll, 0n))
  const shares = result[1]
  await assert.rejects(simulateBorrow(pc, ME, loan.params, limit + parseUnits('1', 6), positionOverride(id, ME, coll, 0n)), `${g.symbol}: borrow past the limit passed`)

  // 3. Repay everything by shares, with USDG and its exact approval given by override.
  const debtState = positionOverride(id, ME, coll, shares)
  const { result: repaid } = await simulateRepay(pc, ME, loan.params, { shares }, merge(debtState, usdgOverride(ME, BLUE, amount * 2n, amount * 2n)))
  assert.ok(repaid[0] >= amount && repaid[0] < amount + parseUnits('0.01', 6), `${g.symbol}: repay amount odd (${repaid[0]})`)

  // 4. Collateral comes back in full with no debt, and not while the debt is open.
  await assert.rejects(simulateWithdrawCollateral(pc, ME, loan.params, coll), `${g.symbol}: withdrew collateral it never put in`)
  await pc.simulateContract({ account: ME, address: BLUE, abi: blueAbi, functionName: 'withdrawCollateral', args: [loan.params, coll, ME, ME], stateOverride: positionOverride(id, ME, coll, 0n) })
  await assert.rejects(
    pc.simulateContract({ account: ME, address: BLUE, abi: blueAbi, functionName: 'withdrawCollateral', args: [loan.params, coll, ME, ME], stateOverride: debtState }),
    `${g.symbol}: took all collateral back with debt open`,
  )

  // 5. Putting collateral in (the token's own approve + supplyCollateral), where the token's slots can be found.
  const fund = await tokenSlots(loan.params.collateralToken)
  let note = 'collateral token slots not found, supplyCollateral not simulated'
  if (fund) {
    await pc.simulateContract({ account: ME, address: BLUE, abi: blueAbi, functionName: 'supplyCollateral', args: [loan.params, coll, ME, '0x'], stateOverride: fund(coll) })
    await assert.rejects(simulateSupplyCollateral(pc, ME, loan.params, coll), `${g.symbol}: supplyCollateral passed with no tokens`)
    note = 'supplyCollateral ok'
    supplied++
  }
  console.log(`ok ${g.symbol.padEnd(8)} ${(Number(loan.params.lltv) / 1e16).toFixed(1)}% LLTV  borrow 100 -> repay ${Number(repaid[0]) / 1e6} USDG, ${note}`)
}
assert.ok(supplied > 0, 'supplyCollateral was not simulated on any market')
console.log(`borrow check passed: ${picks.length} markets, supplyCollateral on ${supplied}`)
