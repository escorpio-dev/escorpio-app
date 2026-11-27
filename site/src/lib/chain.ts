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

// The RPC answers "Too Many Requests" in bursts. viem's default retries (150 ms base) give up inside a burst; a 400 ms
// base backs off 0.8, 1.6, 3.2 and 6.4 s. The MCP server needs this most: Cloudflare shares outgoing IPs.
export const publicClient = createPublicClient({ chain: robinhood, transport: http(undefined, { batch: true, retryCount: 4, retryDelay: 400 }) })

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`
export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
