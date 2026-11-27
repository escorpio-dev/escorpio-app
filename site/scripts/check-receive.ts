// Proves the Receive flow against the real USDG contract on Robinhood Chain without moving money: a request signed by a
// throwaway in-memory key, the link round trip, tampering and expiry, the USDG transfer (with the ref at the end of the
// calldata) simulated with a state override, and a receipt read from a real past USDG transfer. Run: npm run check:receive
import assert from 'node:assert/strict'
import { createPublicClient, custom, encodeFunctionData, HttpRequestError, parseAbiItem, parseUnits, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { USDG } from '../src/data/morpho.ts'
import { publicClient as pc, robinhood } from '../src/lib/chain.ts'
import {
  expired,
  fromQuery,
  matches,
  newRef,
  readReceipt,
  refFromInput,
  refSuffix,
  simulatePay,
  toQuery,
  transferAbi,
  typedData,
  verifyRequest,
  type Request,
} from '../src/lib/receive.ts'
import { usdgOverride } from '../src/lib/vault-tx.ts'

// 1. Sign, put in a link, read back, verify.
const payee = privateKeyToAccount(generatePrivateKey())
const other = privateKeyToAccount(generatePrivateKey())
const req: Request = { to: payee.address, amount: parseUnits('125.5', 6), memo: 'Invoice 7, design work', ref: newRef(), expires: 0n }
const sig = await payee.signTypedData(typedData(req))
const link = fromQuery(toQuery({ ...req, sig }))
assert.ok(link.ok, 'link did not parse')
const back = link.req
assert.equal(back.to, req.to)
assert.equal(back.amount, req.amount)
assert.equal(back.memo, req.memo)
assert.equal(back.ref, req.ref)
assert.ok(await verifyRequest(pc, back), 'genuine request did not verify')

// 2. Anything changed breaks the signature; another wallet's signature does not count.
assert.equal(await verifyRequest(pc, { ...back, amount: back.amount + 1n }), false, 'changed amount still verified')
assert.equal(await verifyRequest(pc, { ...back, memo: 'Invoice 8' }), false, 'changed memo still verified')
assert.equal(await verifyRequest(pc, { ...back, to: other.address }), false, 'changed payee still verified')
const otherSig = await other.signTypedData(typedData(req))
assert.equal(await verifyRequest(pc, { ...back, sig: otherSig }), false, 'a stranger signature verified')

// 3. Malformed links are refused with a reason.
for (const bad of ['', 'to=0x1&amount=1', `to=${payee.address}&amount=0&ref=${req.ref}&sig=${sig}`, `to=${payee.address}&amount=1.1234567&ref=${req.ref}&sig=${sig}`]) {
  assert.equal(fromQuery(bad).ok, false, `bad link accepted: ${bad}`)
}

// 4. Expiry.
assert.equal(expired({ ...req, expires: 0n }, 2_000_000_000), false)
assert.equal(expired({ ...req, expires: 1_000n }, 2_000), true)
assert.equal(expired({ ...req, expires: 3_000n }, 2_000), false)

// 5. The payment: USDG transfer with the ref appended passes for a payer who holds enough, and is refused otherwise.
const payer = privateKeyToAccount(generatePrivateKey()).address
const funded = usdgOverride(payer, payer, 0n, req.amount)
const { request } = await pc.simulateContract({ account: payer, address: USDG as Address, abi: transferAbi, functionName: 'transfer', args: [req.to, req.amount], dataSuffix: refSuffix(req.ref), stateOverride: funded })
assert.equal((request as { dataSuffix?: Hex }).dataSuffix, refSuffix(req.ref), 'simulated request lost the ref suffix')
const data = (encodeFunctionData({ abi: transferAbi, functionName: 'transfer', args: [req.to, req.amount] }) + refSuffix(req.ref).slice(2)) as Hex
await pc.call({ account: payer, to: USDG as Address, data, stateOverride: funded })
assert.equal(refFromInput(data), req.ref, 'ref not read back from calldata')
await assert.rejects(simulatePay(pc, payer, req), 'payment passed with no USDG')

// 6. Receipt from a real past USDG transfer by a plain wallet (no ref): the transfer is found and matched by amount.
// Small windows walking back from the head: a busy USDG can pass the RPC's 10,000-log cap in a few thousand blocks.
const transfer = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')
const head = await pc.getBlockNumber()
let log
for (let to = head, i = 0; !log && i < 20; i++, to -= 500n) {
  const logs = await pc.getLogs({ address: USDG as Address, event: transfer, fromBlock: to - 499n, toBlock: to })
  log = logs.reverse().find((l) => l.args.value! > 0n)
}
assert.ok(log, 'no recent USDG transfer to read')
const rc = await readReceipt(pc, log.transactionHash!)
assert.ok(rc && rc.ok, 'receipt not read')
assert.ok(rc.transfers.some((t) => t.to === log.args.to && t.value === log.args.value), 'transfer missing from receipt')
const m = matches(rc, { to: log.args.to!, amount: log.args.value!, memo: '', ref: '0x0000000000000000', expires: 0n })
assert.ok(m.paid, 'real transfer did not match its own amount and payee')
assert.equal(matches(rc, { to: log.args.to!, amount: log.args.value! + 1n, memo: '', ref: '0x0000000000000000', expires: 0n }).paid, false, 'wrong amount matched')
assert.equal(await readReceipt(pc, `0x${'00'.repeat(32)}`), undefined, 'made-up hash returned a receipt')

// 7. Robinhood Chain not answering (the public RPC refuses bursts with "Too Many Requests") must never read as a bad
// signature or a missing payment: a plain wallet's signature is checked without the chain, anything else throws.
const down = createPublicClient({
  chain: robinhood,
  transport: custom({ request: async () => { throw new HttpRequestError({ url: 'https://rpc.test', status: 429, details: 'Too Many Requests' }) } }, { retryCount: 0 }),
})
assert.equal(await verifyRequest(down, back), true, 'a genuine plain-wallet signature needed the chain')
await assert.rejects(verifyRequest(down, { ...back, amount: back.amount + 1n }), 'an outage read as "signature does not match"')
await assert.rejects(readReceipt(down, log.transactionHash!), 'an outage read as "no such transaction"')

console.log(`ok receipt ${rc.hash.slice(0, 10)}… block ${rc.block}: ${rc.transfers.length} USDG transfer(s), ref ${rc.ref ?? 'none'}`)
console.log('receive check passed: sign, link, tamper, expiry, pay with ref, receipt')
