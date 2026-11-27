import { createPublicClient, fallback, http, type PublicClient } from 'viem'
import { publicClient, robinhood } from '../src/lib/chain.ts'

// The RPC the MCP server uses. The public Robinhood Chain RPC refuses most eth_call traffic from Cloudflare's servers,
// so the server reads through Alchemy first and Chainstack second (Pages secrets RPC_ALCHEMY and RPC_CHAINSTACK, full
// endpoint URLs with their keys), then the public RPC. These keys live only here, on the server: the site in the
// browser keeps using the public RPC and never sees them. Without either secret this is the public client.
export type RpcEnv = { RPC_ALCHEMY?: string; RPC_CHAINSTACK?: string }

const isHttps = (u: string | undefined): u is string => !!u && /^https:\/\/[^\s]+$/.test(u)

export function serverClient(env: RpcEnv | undefined): PublicClient {
  const urls = [env?.RPC_ALCHEMY, env?.RPC_CHAINSTACK].filter(isHttps)
  if (!urls.length) return publicClient as PublicClient
  const opts = { batch: true, retryCount: 1, retryDelay: 300, timeout: 10_000 }
  return createPublicClient({
    chain: robinhood,
    transport: fallback([...urls.map((u) => http(u, opts)), http(undefined, opts)]),
  }) as PublicClient
}
