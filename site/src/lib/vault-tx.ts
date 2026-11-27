import {
  BaseError,
  ContractFunctionRevertedError,
  encodeAbiParameters,
  keccak256,
  numberToHex,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
  type StateOverride,
} from 'viem'
import { USDG } from '../data/morpho.ts'
import { showUnits } from './units.ts'

// Deposits into and withdrawals from Morpho Vault V2 (ERC-4626 style), signed in the user's own wallet. Escorpio has
// no contract: the approval goes to the vault itself, for the exact amount, and the money moves wallet -> vault.
// Every write is simulated (eth_call) first; the UI shows the simulation's answer before asking for a signature.

export const USDG_DECIMALS = 6

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
])

export const vaultAbi = parseAbi([
  'function asset() view returns (address)',
  'function balanceOf(address) view returns (uint256)',
  'function convertToAssets(uint256 shares) view returns (uint256)',
  'function previewDeposit(uint256 assets) view returns (uint256)',
  'function deposit(uint256 assets, address onBehalf) returns (uint256 shares)',
  'function withdraw(uint256 assets, address receiver, address onBehalf) returns (uint256 shares)',
  'function redeem(uint256 shares, address receiver, address onBehalf) returns (uint256 assets)',
])

export type Position = {
  usdg: bigint // USDG in the wallet
  allowance: bigint // what this vault may pull from the wallet right now
  shares: bigint // vault shares held
  inVault: bigint // those shares in USDG today
  eth: bigint // gas money
}

export async function readPosition(pc: PublicClient, account: Address, vault: Address): Promise<Position> {
  const [usdg, allowance, shares, eth] = await Promise.all([
    pc.readContract({ address: USDG, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
    pc.readContract({ address: USDG, abi: erc20Abi, functionName: 'allowance', args: [account, vault] }),
    pc.readContract({ address: vault, abi: vaultAbi, functionName: 'balanceOf', args: [account] }),
    pc.getBalance({ address: account }),
  ])
  const inVault = shares ? await pc.readContract({ address: vault, abi: vaultAbi, functionName: 'convertToAssets', args: [shares] }) : 0n
  return { usdg, allowance, shares, eth, inVault }
}

/** The vault must hold real USDG; checked on chain, not taken from the API. */
export async function vaultAssetIsUsdg(pc: PublicClient, vault: Address) {
  const asset = await pc.readContract({ address: vault, abi: vaultAbi, functionName: 'asset' })
  return asset.toLowerCase() === USDG.toLowerCase()
}

export const simulateApprove = (pc: PublicClient, account: Address, vault: Address, amount: bigint) =>
  pc.simulateContract({ account, address: USDG, abi: erc20Abi, functionName: 'approve', args: [vault, amount] })

// USDG storage layout, found by read-back on 19 Nov 2026 and re-checked by scripts/check-deposit.ts: balances mapping
// at slot 1, allowances at slot 3. Used only to simulate a deposit before the approval exists, so the user sees the
// deposit would pass before they sign anything. The real deposit is simulated again without any override.
const word = (n: bigint) => numberToHex(n, { size: 32 })
const slotOf = (key: Address, slot: bigint | Hex) =>
  keccak256(encodeAbiParameters([{ type: 'address' }, typeof slot === 'bigint' ? { type: 'uint256' } : { type: 'bytes32' }], [key, slot as never]))
export const usdgOverride = (owner: Address, vault: Address, allowance: bigint, balance?: bigint): StateOverride => [
  {
    address: USDG as Address,
    stateDiff: [
      { slot: slotOf(vault, slotOf(owner, 3n)), value: word(allowance) },
      ...(balance === undefined ? [] : [{ slot: slotOf(owner, 1n), value: word(balance) }]),
    ],
  },
]

export const simulateDeposit = (pc: PublicClient, account: Address, vault: Address, amount: bigint, stateOverride?: StateOverride) =>
  pc.simulateContract({ account, address: vault, abi: vaultAbi, functionName: 'deposit', args: [amount, account], stateOverride })

/** Withdraw everything: redeem all shares, so no dust is left behind by rounding. */
export const simulateRedeemAll = (pc: PublicClient, account: Address, vault: Address, shares: bigint) =>
  pc.simulateContract({ account, address: vault, abi: vaultAbi, functionName: 'redeem', args: [shares, account, account] })

export const simulateWithdraw = (pc: PublicClient, account: Address, vault: Address, amount: bigint) =>
  pc.simulateContract({ account, address: vault, abi: vaultAbi, functionName: 'withdraw', args: [amount, account, account] })

// ---- one deposit or withdrawal, planned the same way by the site dialog and the MCP server ---------------------

export type VaultMode = 'deposit' | 'withdraw'
export type VaultSim = { ok: true; out: bigint } | { ok: false; why: string }
const showUsdg = (v: bigint) => showUnits(v, USDG_DECIMALS)

/** Why this amount cannot go ahead, or undefined when it can be simulated. */
export function vaultBlock(mode: VaultMode, amount: bigint, pos: Position | undefined) {
  if (!pos || amount === 0n) return undefined
  if (mode === 'deposit' && amount > pos.usdg) return `Your wallet holds ${showUsdg(pos.usdg)} USDG.`
  if (mode === 'withdraw' && amount > pos.inVault) return `You have ${showUsdg(pos.inVault)} USDG in this vault.`
  if (pos.eth === 0n) return 'Your wallet has no ETH on Robinhood Chain for the network fee. Add a little first.'
  return undefined
}

export const vaultNeedsApproval = (mode: VaultMode, amount: bigint, pos: Position) => mode === 'deposit' && pos.allowance < amount
export const vaultWithdrawAll = (mode: VaultMode, amount: bigint, pos: Position) => mode === 'withdraw' && amount === pos.inVault

/** The signatures this action needs, in order. */
export function vaultSteps(mode: VaultMode, amount: bigint, pos: Position) {
  if (mode === 'withdraw') return [{ key: 'withdraw', label: `Withdraw ${showUsdg(amount)} USDG` }]
  return [
    ...(vaultNeedsApproval(mode, amount, pos) ? [{ key: 'approve', label: `Allow the vault to take exactly ${showUsdg(amount)} USDG` }] : []),
    { key: 'deposit', label: `Deposit ${showUsdg(amount)} USDG` },
  ]
}

/** Simulates the end result. A deposit that still needs its approval is simulated as if the exact approval were given.
 * `out` is what the user gets: vault shares for a deposit, USDG for a withdrawal. deposit() returns shares and redeem()
 * returns USDG, but withdraw(assets) returns the shares it burns: the USDG out is the amount asked for. */
export async function simulateVaultPlan(pc: PublicClient, account: Address, vault: Address, mode: VaultMode, amount: bigint, pos: Position): Promise<VaultSim> {
  try {
    if (mode === 'deposit') {
      const ov = vaultNeedsApproval(mode, amount, pos) ? usdgOverride(account, vault, amount) : undefined
      return { ok: true, out: (await simulateDeposit(pc, account, vault, amount, ov)).result }
    }
    if (vaultWithdrawAll(mode, amount, pos)) return { ok: true, out: (await simulateRedeemAll(pc, account, vault, pos.shares)).result }
    await simulateWithdraw(pc, account, vault, amount)
    return { ok: true, out: amount }
  } catch (e) {
    return { ok: false, why: plainError(e) }
  }
}

/** A failed simulation or wallet error in one plain sentence. */
export function plainError(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((x) => (x as { code?: number }).code === 4001)) return 'You cancelled it in your wallet.'
    const revert = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null
    if (revert) {
      const why = revert.data?.errorName ?? revert.reason
      return why ? `The vault refused it (${why}). Nothing was sent.` : 'The vault refused it. Nothing was sent.'
    }
    if (/insufficient funds/i.test(e.message)) return 'Not enough ETH on Robinhood Chain to pay the network fee.'
    return e.shortMessage
  }
  return e instanceof Error ? e.message : String(e)
}
