// A second source for the vault sizes. Morpho's API gives each vault's size in US dollars; this reads the same vaults
// straight from Robinhood Chain (ERC-4626 asset() and totalAssets(), one batched eth_call round) and says whether the
// two agree. Read-only, nothing is signed. If the chain does not answer, the API still answers with Morpho's numbers
// and says the chain check is missing; it never blocks a reading.
import { formatUnits, parseAbi, type Address, type PublicClient } from 'viem'
import { USDG } from '../src/data/morpho.ts'
import type { Vault } from '../src/data/morpho.ts'

const ABI = parseAbi(['function asset() view returns (address)', 'function totalAssets() view returns (uint256)'])
const USDG_DECIMALS = 6

// Measured 2026-11-27 over all 41 vaults: Morpho's dollar figure sits 0.01% above the on-chain USDG amount (Morpho
// prices USDG a hair under $1) and tiny vaults differ by cents. 1% or $5, whichever is larger, is far outside that.
export const AGREE = { pct: 1, usd: 5 }
export const agrees = (morphoUsd: number, chainUsdg: number) =>
  Math.abs(chainUsdg - morphoUsd) <= Math.max((morphoUsd * AGREE.pct) / 100, AGREE.usd)

export type VaultCheck = { totalUsdg: number; assetIsUsdg: boolean; agreesWithMorpho: boolean }
export type ChainCheck = { readAt: number; vaults: Record<string, VaultCheck | null> } // null: that vault's read failed

const BUDGET_MS = 5_000

/** Reads every vault on chain. Throws only when nothing could be read at all (or the budget ran out). */
export async function checkVaults(pc: PublicClient, vaults: Vault[], now = Date.now()): Promise<ChainCheck> {
  const read = Promise.all(
    vaults.map(async (v): Promise<VaultCheck | null> => {
      const address = v.address as Address
      try {
        const [asset, total] = await Promise.all([
          pc.readContract({ address, abi: ABI, functionName: 'asset' }),
          pc.readContract({ address, abi: ABI, functionName: 'totalAssets' }),
        ])
        const totalUsdg = Number(formatUnits(total, USDG_DECIMALS))
        const assetIsUsdg = asset.toLowerCase() === USDG.toLowerCase()
        return { totalUsdg, assetIsUsdg, agreesWithMorpho: assetIsUsdg && agrees(v.totalUsd, totalUsdg) }
      } catch {
        return null
      }
    }),
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, no) => (timer = setTimeout(() => no(new Error('chain check took too long')), BUDGET_MS)))
  try {
    const checks = await Promise.race([read, timeout])
    if (vaults.length && checks.every((c) => c === null)) throw new Error('Robinhood Chain did not answer')
    return { readAt: now, vaults: Object.fromEntries(vaults.map((v, i) => [v.address.toLowerCase(), checks[i]])) }
  } finally {
    clearTimeout(timer)
  }
}

export const vaultCheckOut = (c: VaultCheck | null | undefined) =>
  c ? { totalUsdg: Math.round(c.totalUsdg), assetIsUsdg: c.assetIsUsdg, agreesWithMorpho: c.agreesWithMorpho } : null

/** The summary every API answer carries, so a reader sees at once whether the two sources agree. */
export function chainSummary(chain: ChainCheck | undefined, error?: string) {
  const how = `asset() and totalAssets() read from each vault contract on Robinhood Chain; Morpho's size and the chain's agree when they differ by at most ${AGREE.pct}% or $${AGREE.usd}`
  if (!chain) return { checked: false, why: error ?? 'not read', how }
  const all = Object.values(chain.vaults)
  const read = all.filter((c): c is VaultCheck => c !== null)
  return {
    checked: true,
    readAt: new Date(chain.readAt).toISOString(),
    vaultsRead: read.length,
    vaultsNotRead: all.length - read.length,
    agree: read.filter((c) => c.agreesWithMorpho).length,
    disagree: read.filter((c) => !c.agreesWithMorpho).length,
    how,
  }
}
