import { formatUnits, isAddress, isHex, parseAbi, parseEventLogs, type Address, type Hash, type Hex, type PublicClient } from 'viem'
import { CHAIN_ID, USDG } from '../data/morpho.ts'
import { USDG_DECIMALS } from './vault-tx.ts'

// Receive: a payment request is a few fields signed by the wallet that gets paid (EIP-712, a signature, never a
// transaction) and carried in the link itself. There is no database: anyone holding the link can check that the
// payee signed exactly this amount and memo, and nobody can change them without breaking the signature.
// The payer sends a plain USDG transfer from their own wallet straight to the payee. Eight bytes of the request's
// reference ride at the end of the transfer's calldata (ERC-20 ignores trailing bytes), so a receipt can prove which
// request a transfer paid.

export type Request = {
  to: Address
  amount: bigint // USDG base units (6 decimals)
  memo: string
  ref: Hex // 8 random bytes
  expires: bigint // unix seconds, 0 = never
}
export type Signed = Request & { sig: Hex }

export const MEMO_MAX = 120

export const domain = { name: 'Escorpio Receive', version: '1', chainId: CHAIN_ID } as const
export const types = {
  PaymentRequest: [
    { name: 'to', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'memo', type: 'string' },
    { name: 'ref', type: 'bytes8' },
    { name: 'expires', type: 'uint64' },
  ],
} as const

export const typedData = (r: Request) =>
  ({
    domain,
    types,
    primaryType: 'PaymentRequest',
    message: { to: r.to, token: USDG as Address, amount: r.amount, memo: r.memo, ref: r.ref, expires: r.expires },
  }) as const

export function newRef(): Hex {
  const b = new Uint8Array(8)
  crypto.getRandomValues(b)
  return `0x${[...b].map((x) => x.toString(16).padStart(2, '0')).join('')}`
}

// Calldata suffix: "ESC1" then the 8-byte ref.
const TAG = '45534331'
export const refSuffix = (ref: Hex): Hex => `0x${TAG}${ref.slice(2).toLowerCase()}`
export function refFromInput(input: Hex): Hex | undefined {
  const tail = input.slice(-24).toLowerCase()
  return input.length >= 2 + 136 + 24 && tail.startsWith(TAG) ? `0x${tail.slice(8)}` : undefined
}

// ---- link <-> request -------------------------------------------------------------------------------------------

export function toQuery(s: Signed): string {
  const q = new URLSearchParams({ to: s.to, amount: formatUnits(s.amount, USDG_DECIMALS), ref: s.ref })
  if (s.memo) q.set('memo', s.memo)
  if (s.expires) q.set('exp', String(s.expires))
  q.set('sig', s.sig)
  return q.toString()
}

/** Reads a request from a link's query string. Returns why when a field is missing or malformed. */
export function fromQuery(search: string): { ok: true; req: Signed } | { ok: false; why: string } {
  const q = new URLSearchParams(search)
  const to = q.get('to') ?? ''
  const raw = q.get('amount') ?? ''
  const ref = q.get('ref') ?? ''
  const sig = q.get('sig') ?? ''
  const memo = q.get('memo') ?? ''
  const exp = q.get('exp') ?? '0'
  if (!isAddress(to)) return { ok: false, why: 'The link has no valid payee address.' }
  if (!/^\d+(\.\d{1,6})?$/.test(raw)) return { ok: false, why: 'The link has no valid amount.' }
  if (!/^0x[0-9a-fA-F]{16}$/.test(ref)) return { ok: false, why: 'The link has no valid reference.' }
  if (!isHex(sig) || sig.length < 132) return { ok: false, why: 'The link is not signed.' }
  if (memo.length > MEMO_MAX) return { ok: false, why: 'The memo in the link is too long.' }
  if (!/^\d{1,12}$/.test(exp)) return { ok: false, why: 'The link has a broken expiry.' }
  const [whole, frac = ''] = raw.split('.')
  const amount = BigInt(whole) * 10n ** 6n + BigInt(frac.padEnd(6, '0'))
  if (amount === 0n) return { ok: false, why: 'The link asks for 0 USDG.' }
  return { ok: true, req: { to, amount, memo, ref: ref.toLowerCase() as Hex, expires: BigInt(exp), sig } }
}

/** Did the payee sign exactly this request? Works for plain wallets and smart-contract wallets (ERC-1271). */
export async function verifyRequest(pc: PublicClient, s: Signed): Promise<boolean> {
  try {
    return await pc.verifyTypedData({ address: s.to, signature: s.sig, ...typedData(s) })
  } catch {
    return false
  }
}

export const expired = (s: Request, nowSec: number) => s.expires !== 0n && BigInt(nowSec) > s.expires

// ---- paying -----------------------------------------------------------------------------------------------------

export const transferAbi = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
])

/** The payment itself: USDG transfer from the payer to the payee, the request's ref appended to the calldata. */
export const simulatePay = (pc: PublicClient, payer: Address, r: Request) =>
  pc.simulateContract({
    account: payer,
    address: USDG as Address,
    abi: transferAbi,
    functionName: 'transfer',
    args: [r.to, r.amount],
    dataSuffix: refSuffix(r.ref),
  })

// ---- receipts ---------------------------------------------------------------------------------------------------

export type Receipt = {
  hash: Hash
  ok: boolean // the transaction succeeded on chain
  from: Address
  block: bigint
  time: number // unix seconds
  transfers: { from: Address; to: Address; value: bigint }[] // USDG transfers in it
  ref?: Hex // ref found at the end of the calldata, if any
}

/** Reads a transaction and every USDG transfer in it. Undefined when the chain has no such transaction yet. */
export async function readReceipt(pc: PublicClient, hash: Hash): Promise<Receipt | undefined> {
  const [tx, rc] = await Promise.all([pc.getTransaction({ hash }).catch(() => undefined), pc.getTransactionReceipt({ hash }).catch(() => undefined)])
  if (!tx || !rc) return undefined
  const block = await pc.getBlock({ blockNumber: rc.blockNumber })
  const transfers = parseEventLogs({ abi: transferAbi, logs: rc.logs, eventName: 'Transfer' })
    .filter((l) => l.address.toLowerCase() === USDG.toLowerCase())
    .map((l) => ({ from: l.args.from, to: l.args.to, value: l.args.value }))
  return { hash, ok: rc.status === 'success', from: tx.from, block: rc.blockNumber, time: Number(block.timestamp), transfers, ref: refFromInput(tx.input) }
}

/** Does this receipt pay this request: a successful USDG transfer of the exact amount to the payee, with its ref? */
export function matches(rc: Receipt, r: Request) {
  const paid = rc.transfers.some((t) => t.to.toLowerCase() === r.to.toLowerCase() && t.value === r.amount)
  return { paid: rc.ok && paid, refMatch: rc.ref === r.ref.toLowerCase() }
}
