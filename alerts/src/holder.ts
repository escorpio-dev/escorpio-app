// Holder perks (stage 2 of launch-kit/LAUNCH.md). Everything here stays off until TOKEN_ADDRESS and HOLDER_MIN are set
// on launch day. A chat links one wallet by signing a plain message on escorpio.pro/link (a signature, never a
// transaction); the wallet's $ESCORPIO balance decides the tier, and it is read again every day.
import { createPublicClient, defineChain, erc20Abi, http, isAddress, type Address, type Hex } from 'viem'

export type HolderEnv = { TOKEN_ADDRESS?: string; HOLDER_MIN?: string; RPC_URL?: string }

/** Holder perks are on only once the token exists and a threshold (raw token units) is set. */
export function holdersOn(env: HolderEnv) {
  return !!env.TOKEN_ADDRESS && isAddress(env.TOKEN_ADDRESS) && /^\d+$/.test(env.HOLDER_MIN ?? '') && BigInt(env.HOLDER_MIN!) > 0n
}

export const LINK_TTL_MS = 15 * 60_000

// The exact text the wallet signs, shared with the site's /link page.
export { linkMessage } from '../../site/src/data/alerts-link.ts'

export const isCode = (s: unknown): s is string => typeof s === 'string' && /^[A-Za-z0-9]{12}$/.test(s)
export function newCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, (b) => abc[b % abc.length]).join('')
}

export type Chain = {
  verify(address: Address, message: string, signature: Hex): Promise<boolean>
  balance(token: Address, owner: Address): Promise<bigint>
}

const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
})

// Real chain access; tests swap it with setChain(). verifyMessage covers plain wallets and smart wallets (ERC-1271).
let chain: Chain | undefined
export function setChain(c: Chain | undefined) {
  chain = c
}
export function getChain(env: HolderEnv): Chain {
  if (chain) return chain
  const client = createPublicClient({ chain: robinhood, transport: http(env.RPC_URL || undefined) })
  return {
    verify: (address, message, signature) => client.verifyMessage({ address, message, signature }),
    balance: (token, owner) => client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
  }
}

export async function tierFor(env: HolderEnv, wallet: Address) {
  const bal = await getChain(env).balance(env.TOKEN_ADDRESS as Address, wallet)
  return bal >= BigInt(env.HOLDER_MIN!) ? ('holder' as const) : ('free' as const)
}
