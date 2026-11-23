import { connect, disconnect, switchToRobinhood, useWallet } from '@/lib/use-wallet'
import { shortAddress } from '@/lib/chain'
import { useState } from 'react'

// The wallets this browser has, by the name and icon each wallet gives itself. One click asks that wallet for an
// address; nothing is signed here.
const DEFAULT_LEAD = 'Connect the wallet that holds your USDG. Escorpio only reads its address; every transaction is signed in the wallet.'

export function WalletPicker({ lead = DEFAULT_LEAD }: { lead?: string }) {
  const { wallets, connecting, error } = useWallet()
  return (
    <div>
      <p className="text-[16px] text-body">{lead}</p>
      {wallets.length ? (
        <ul className="mt-4 grid gap-2">
          {wallets.map((w) => (
            <li key={w.info.uuid}>
              <button
                type="button"
                disabled={connecting}
                onClick={() => void connect(w)}
                className="flex min-h-12 w-full items-center gap-3 border border-line-2 px-4 text-left text-[16px] text-ink transition-colors hover:border-accent focus-visible:border-accent disabled:opacity-60"
              >
                {w.info.icon ? <img src={w.info.icon} alt="" width={24} height={24} /> : <span aria-hidden className="h-6 w-6 border border-line-2" />}
                {w.info.name}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border border-line-2 p-4 text-[15px] text-body">
          No wallet found in this browser. Add a wallet extension (MetaMask, Rabby or another), then reload this page. On a phone,
          open this page inside your wallet app's browser.
        </p>
      )}
      {connecting && <p className="mt-3 text-[15px] text-body">Check your wallet…</p>}
      {error && <p className="mt-3 text-[15px] text-antares-ink">{error}</p>}
    </div>
  )
}

/** Asks the wallet to move to Robinhood Chain. */
export function SwitchChain() {
  const [err, setErr] = useState<string>()
  return (
    <div>
      <p className="text-[16px] text-body">Your wallet is on another network. The vaults live on Robinhood Chain.</p>
      <button type="button" className="button mt-4" onClick={() => switchToRobinhood().catch((e) => setErr((e as Error).message))}>
        Switch to Robinhood Chain
      </button>
      {err && <p className="mt-3 text-[15px] text-antares-ink">{err}</p>}
    </div>
  )
}

/** Small line with the connected address and a way out. */
export function WalletLine() {
  const { address, current } = useWallet()
  if (!address) return null
  return (
    <p className="num flex flex-wrap items-center gap-x-3 text-[14px] text-muted">
      <span>
        {current?.info.name ?? 'Wallet'} {shortAddress(address)}
      </span>
      <button type="button" onClick={disconnect} className="accent-link">
        Disconnect
      </button>
    </p>
  )
}
