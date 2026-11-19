import { createPublicClient, defineChain, http } from 'viem'
import { CHAIN_ID, EXPLORER } from '../data/morpho.ts'

// Robinhood Chain (4663). The public RPC is rate-limited and has no SLA, which is fine for one person's reads and
// simulations from their own browser; a backend would need a provider (see memory robinhood-chain-data-sources).
export const robinhood = defineChain({
  id: CHAIN_ID,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
  blockExplorers: { default: { name: 'Blockscout', url: EXPLORER } },
})

export const publicClient = createPublicClient({ chain: robinhood, transport: http(undefined, { batch: true }) })

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`
export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
