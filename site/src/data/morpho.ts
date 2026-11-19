// Reads Morpho markets and vaults on Robinhood Chain straight from the public Morpho API (no key, CORS open).
// Front end only for now; a backend snapshot comes later (PLAN.md step 2).
// The API caps query cost at 1,000,000 points: 200 markets + 100 vaults fits (19 Nov), 300 + 300 does not. Markets
// under $100 supplied are left out (316 of 378 USDG markets on 19 Nov were dust or empty).

export const CHAIN_ID = 4663
export const MORPHO_API = 'https://api.morpho.org/graphql'
// The real USDG. Other tokens on this chain also call themselves "USDG" (seen 19 Nov: two vaults hold a different
// "USDG" contract), so everything is matched by address, never by symbol.
export const USDG = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168'
export const MORPHO_BLUE = '0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010'
export const EXPLORER = 'https://robinhoodchain.blockscout.com'

export type Warning = { type: string; level: string }

export type Market = {
  id: string
  lltv: number // 0..1, the loan-to-value at which a position gets liquidated
  createdAt: number // unix seconds
  listed: boolean
  collateral: { symbol: string; name: string; address: string }
  borrowApy: number // 0..1
  supplyApy: number
  supplyUsd: number
  borrowUsd: number
  availableUsd: number // what can still be borrowed right now
  utilization: number // 0..1
  warnings: Warning[]
}

export type Vault = {
  address: string
  name: string
  listed: boolean
  netApy: number // 0..1, after vault fees
  totalUsd: number
  withdrawableUsd: number // liquidity that can leave the vault right now
  performanceFee: number
  managementFee: number
  curators: string[]
  createdAt: number
  warnings: Warning[]
}

export type Desk = { markets: Market[]; vaults: Vault[]; readAt: number; marketCount: number }

const QUERY = `{
  markets(first: 200, orderBy: SupplyAssetsUsd, orderDirection: Desc,
    where: { chainId_in: [${CHAIN_ID}], loanAssetAddress_in: ["${USDG}"], supplyAssetsUsd_gte: 100 }) {
    pageInfo { countTotal }
    items {
      marketId lltv creationTimestamp listed
      collateralAsset { symbol name address }
      state { borrowApy supplyApy supplyAssetsUsd borrowAssetsUsd liquidityAssetsUsd utilization }
      warnings { type level }
    }
  }
  vaultV2s(first: 100, where: { chainId_in: [${CHAIN_ID}] }) {
    items {
      name address listed netApy totalAssetsUsd liquidityUsd performanceFee managementFee creationTimestamp
      asset { address }
      curators { items { name } }
      warnings { type level }
    }
  }
}`

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseDesk(json: any, readAt: number): Desk {
  if (json?.errors?.length) throw new Error(`Morpho API: ${json.errors[0].message}`)
  const m = json?.data?.markets
  const v = json?.data?.vaultV2s
  if (!m?.items || !v?.items) throw new Error('Morpho API: unexpected answer')
  const markets: Market[] = m.items
    .filter((x: any) => x.collateralAsset && x.state)
    .map((x: any) => ({
      id: x.marketId,
      lltv: Number(x.lltv) / 1e18,
      createdAt: num(x.creationTimestamp),
      listed: !!x.listed,
      collateral: { symbol: x.collateralAsset.symbol, name: x.collateralAsset.name ?? '', address: x.collateralAsset.address },
      borrowApy: num(x.state.borrowApy),
      supplyApy: num(x.state.supplyApy),
      supplyUsd: num(x.state.supplyAssetsUsd),
      borrowUsd: num(x.state.borrowAssetsUsd),
      availableUsd: num(x.state.liquidityAssetsUsd),
      utilization: num(x.state.utilization),
      warnings: x.warnings ?? [],
    }))
  const vaults: Vault[] = v.items
    .filter((x: any) => x.asset && same(x.asset.address, USDG))
    .map((x: any) => ({
      address: x.address,
      name: x.name,
      listed: !!x.listed,
      netApy: num(x.netApy),
      totalUsd: num(x.totalAssetsUsd),
      withdrawableUsd: num(x.liquidityUsd),
      performanceFee: num(x.performanceFee),
      managementFee: num(x.managementFee),
      curators: (x.curators?.items ?? []).map((c: any) => c.name).filter(Boolean),
      createdAt: num(x.creationTimestamp),
      warnings: x.warnings ?? [],
    }))
  return { markets, vaults, readAt, marketCount: num(m.pageInfo?.countTotal) || markets.length }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchDesk(signal?: AbortSignal): Promise<Desk> {
  const res = await fetch(MORPHO_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY }),
    signal,
  })
  const json = await res.json().catch(() => null)
  if (!res.ok && !json?.errors) throw new Error(`Morpho API answered ${res.status}`)
  return parseDesk(json, Date.now())
}
