import { useSyncExternalStore } from 'react'
import { createWalletClient, custom, numberToHex, type Address, type EIP1193Provider } from 'viem'
import { robinhood } from '@/lib/chain'

// The user's own browser wallet, found with EIP-6963 (each installed wallet announces itself, so MetaMask, Rabby,
// Coinbase and others show up by name) and window.ethereum as a fallback. Escorpio never sees a key: it asks the
// wallet for the address and asks the user to sign each transaction there.

export type WalletInfo = { uuid: string; name: string; icon: string; rdns: string }
type Found = { info: WalletInfo; provider: EIP1193Provider }
type State = { wallets: Found[]; current?: Found; address?: Address; chainId?: number; connecting: boolean; error?: string }

let state: State = { wallets: [], connecting: false }
const subs = new Set<() => void>()
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch }
  subs.forEach((f) => f())
}
const LAST = 'escorpio.wallet'
const remember = (rdns?: string) => {
  try {
    if (rdns) localStorage.setItem(LAST, rdns)
    else localStorage.removeItem(LAST)
  } catch {
    /* private window: just do not remember */
  }
}
const lastRdns = () => {
  try {
    return localStorage.getItem(LAST)
  } catch {
    return null
  }
}

type Announce = CustomEvent<{ info: WalletInfo; provider: EIP1193Provider }>
let started = false
function start() {
  if (started || typeof window === 'undefined') return
  started = true
  window.addEventListener('eip6963:announceProvider', (e) => {
    const { info, provider } = (e as Announce).detail
    if (state.wallets.some((w) => w.info.uuid === info.uuid)) return
    set({ wallets: [...state.wallets, { info, provider }] })
    if (!state.current && info.rdns === lastRdns()) void attach({ info, provider }, false)
  })
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  // Old wallets that do not announce themselves.
  setTimeout(() => {
    const eth = (window as { ethereum?: EIP1193Provider }).ethereum
    if (!state.wallets.length && eth) {
      const f = { info: { uuid: 'injected', name: 'Browser wallet', icon: '', rdns: 'injected' }, provider: eth }
      set({ wallets: [f] })
      if (lastRdns() === 'injected') void attach(f, false)
    }
  }, 400)
}

const onAccounts = (a: unknown) => {
  const list = a as Address[]
  if (!list.length) disconnect()
  else set({ address: list[0] })
}
const onChain = (id: unknown) => set({ chainId: Number(id) })

async function attach(w: Found, ask: boolean) {
  set({ connecting: ask, error: undefined })
  try {
    const accounts = (await w.provider.request({ method: ask ? 'eth_requestAccounts' : 'eth_accounts' })) as Address[]
    if (!accounts.length) return set({ connecting: false })
    const chainId = Number(await w.provider.request({ method: 'eth_chainId' }))
    state.current?.provider.removeListener?.('accountsChanged', onAccounts)
    state.current?.provider.removeListener?.('chainChanged', onChain)
    w.provider.on?.('accountsChanged', onAccounts)
    w.provider.on?.('chainChanged', onChain)
    remember(w.info.rdns)
    set({ current: w, address: accounts[0], chainId, connecting: false })
  } catch (e) {
    const code = (e as { code?: number }).code
    set({ connecting: false, error: code === 4001 ? 'You said no in your wallet.' : (e as Error).message })
  }
}

export const connect = (w: Found) => attach(w, true)

export function disconnect() {
  state.current?.provider.removeListener?.('accountsChanged', onAccounts)
  state.current?.provider.removeListener?.('chainChanged', onChain)
  remember(undefined)
  set({ current: undefined, address: undefined, chainId: undefined })
}

/** Ask the wallet to move to Robinhood Chain, adding it first if the wallet does not know it. */
export async function switchToRobinhood() {
  const p = state.current?.provider
  if (!p) return
  const chainId = numberToHex(robinhood.id)
  try {
    await p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
  } catch (e) {
    if ((e as { code?: number }).code !== 4902) throw e
    await p.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId,
          chainName: robinhood.name,
          nativeCurrency: robinhood.nativeCurrency,
          rpcUrls: [...robinhood.rpcUrls.default.http],
          blockExplorerUrls: [robinhood.blockExplorers!.default.url],
        },
      ],
    })
  }
}

export function walletClient() {
  const { current, address } = state
  if (!current || !address) throw new Error('No wallet connected')
  return createWalletClient({ account: address, chain: robinhood, transport: custom(current.provider) })
}

export function useWallet() {
  start()
  const s = useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => state,
    () => state,
  )
  return { ...s, onRobinhood: s.chainId === robinhood.id }
}
