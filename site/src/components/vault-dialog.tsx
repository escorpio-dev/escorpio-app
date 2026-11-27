import { useCallback, useEffect, useRef, useState } from 'react'
import { formatUnits, type Address, type Hash } from 'viem'
import { PresetNote } from '@/components/preset-note'
import { RiskNotes } from '@/components/risk-notes'
import { SwitchChain, WalletLine, WalletPicker } from '@/components/wallet-picker'
import { vaultNotes } from '@/data/desk'
import type { Vault } from '@/data/morpho'
import { publicClient, shortAddress, txUrl } from '@/lib/chain'
import { pct, usd, usdg } from '@/lib/format'
import { useWallet } from '@/lib/use-wallet'
import { toUnits, useTx } from '@/lib/use-tx'
import {
  USDG_DECIMALS,
  readPosition,
  simulateApprove,
  simulateDeposit,
  simulateRedeemAll,
  simulateVaultPlan,
  simulateWithdraw,
  vaultBlock,
  vaultNeedsApproval,
  vaultWithdrawAll,
  type Position,
  type VaultMode,
  type VaultSim,
} from '@/lib/vault-tx'

// Deposit into or withdraw from one Morpho vault, from the user's own wallet. Order of every action:
// 1) say in plain words what will happen, 2) simulate it on chain, 3) only then ask the wallet to sign.
// The approval is for the exact amount, to the vault itself (Escorpio has no contract).

type Mode = VaultMode
type Sim = VaultSim | undefined
const show = (v: bigint) => usdg(Number(formatUnits(v, USDG_DECIMALS)))

/** Filled in from a link (lib/action-link.ts), for example one an AI agent made. "all" waits for the balance read. */
export type VaultPreset = { mode: VaultMode; amount: string }

export function VaultDialog({ vault, readAt, onClose, preset }: { vault: Vault; readAt: number; onClose: () => void; preset?: VaultPreset }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { address, onRobinhood } = useWallet()
  const [mode, setMode] = useState<Mode>(preset?.mode ?? 'deposit')
  const [raw, setRaw] = useState(preset && preset.amount !== 'all' ? preset.amount : '')
  const [fillAll, setFillAll] = useState(preset?.amount === 'all')
  const [pos, setPos] = useState<Position>()
  const [readErr, setReadErr] = useState(false)
  const [sim, setSim] = useState<Sim>()
  const [done, setDone] = useState<{ hash: Hash; text: string }>()
  const [approved, setApproved] = useState(false)
  const v = vault.address as Address
  const notes = vaultNotes(vault, readAt)
  const amount = toUnits(raw, USDG_DECIMALS)
  const ready = !!address && onRobinhood

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const refresh = useCallback(async () => {
    if (!address) return
    setReadErr(false)
    try {
      setPos(await readPosition(publicClient, address, v))
    } catch {
      setReadErr(true)
    }
  }, [address, v])
  useEffect(() => {
    if (ready) void refresh()
  }, [ready, refresh])
  useEffect(() => {
    if (fillAll && pos) (setRaw(formatUnits(pos.inVault, USDG_DECIMALS)), setFillAll(false))
  }, [fillAll, pos])

  // What stops the action before anything is simulated.
  const block = vaultBlock(mode, amount, pos)
  const needApprove = !!pos && vaultNeedsApproval(mode, amount, pos)
  const all = !!pos && vaultWithdrawAll(mode, amount, pos)

  // Simulate as the user types (after a short pause), the same plan the MCP server simulates (lib/vault-tx.ts).
  useEffect(() => {
    setSim(undefined)
    if (!address || !pos || amount === 0n || block) return
    let live = true
    const t = setTimeout(() => void simulateVaultPlan(publicClient, address, v, mode, amount, pos).then((r) => live && setSim(r)), 400)
    return () => {
      clearTimeout(t)
      live = false
    }
  }, [address, pos, amount, block, mode, v])

  const { busy, err, setErr, send } = useTx(refresh)
  const approve = async () => {
    if (await send('Allowing', () => simulateApprove(publicClient, address!, v, amount))) setApproved(true)
  }
  const deposit = async () => {
    const hash = await send('Depositing', () => simulateDeposit(publicClient, address!, v, amount))
    if (hash) (setDone({ hash, text: `Deposited ${show(amount)} USDG into ${vault.name}.` }), setRaw(''))
  }
  const withdraw = async () => {
    const hash = await send('Withdrawing', () =>
      all ? simulateRedeemAll(publicClient, address!, v, pos!.shares) : simulateWithdraw(publicClient, address!, v, amount),
    )
    if (hash) (setDone({ hash, text: `Withdrew ${show(amount)} USDG to your wallet.` }), setRaw(''))
  }

  const max = mode === 'deposit' ? pos?.usdg : pos?.inVault
  const stop = notes.some((n) => n.stop)

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="vault-dialog-title"
      className="m-auto w-[min(560px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-y-auto border border-line-2 bg-bg p-0 text-ink backdrop:bg-black/75"
    >
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="label">Morpho vault · {shortAddress(v)}</div>
            <h2 id="vault-dialog-title" className="mt-2 text-[24px] font-bold leading-tight">
              {vault.name || 'Unnamed vault'}
            </h2>
            <p className="num mt-1 text-[15px] text-body">
              {pct(vault.netApy)} net a year now · {usd(vault.withdrawableUsd)} withdrawable now
            </p>
          </div>
          <button type="button" onClick={() => ref.current?.close()} className="min-h-11 min-w-11 border border-line-2 text-[20px] leading-none hover:border-accent" aria-label="Close">
            ×
          </button>
        </div>

        <div className="mt-4">
          <RiskNotes notes={notes} />
        </div>
        {preset && <PresetNote />}

        <div role="tablist" aria-label="Action" className="mt-6 grid grid-cols-2 border border-line-2">
          {(['deposit', 'withdraw'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => (setMode(m), setRaw(''), setErr(undefined), setDone(undefined))}
              className={`min-h-11 font-mono text-[15px] capitalize ${mode === m ? 'bg-accent text-on-accent' : 'text-ink hover:text-accent'}`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {!address ? (
            <WalletPicker />
          ) : !onRobinhood ? (
            <SwitchChain />
          ) : mode === 'deposit' && stop ? (
            <p className="text-[16px] text-antares-ink">This vault has a stop flag right now (see above), so Escorpio does not offer deposits into it.</p>
          ) : (
            <>
              {readErr && (
                <p className="mb-4 text-[15px] text-antares-ink">
                  Could not read your balance from Robinhood Chain.{' '}
                  <button type="button" onClick={() => void refresh()} className="accent-link">
                    Try again
                  </button>
                </p>
              )}
              <dl className="num grid grid-cols-2 gap-4 text-[15px]">
                <div>
                  <dt className="label">In your wallet</dt>
                  <dd className="mt-1 text-ink">{pos ? `${show(pos.usdg)} USDG` : readErr ? 'no data yet' : 'Reading…'}</dd>
                </div>
                <div>
                  <dt className="label">In this vault</dt>
                  <dd className="mt-1 text-ink">{pos ? `${show(pos.inVault)} USDG` : readErr ? 'no data yet' : 'Reading…'}</dd>
                </div>
              </dl>

              <label htmlFor="vault-amount" className="label mt-6 block">
                {mode === 'deposit' ? 'USDG to deposit' : 'USDG to withdraw'}
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="vault-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={raw}
                  onChange={(e) => (setRaw(e.target.value.replace(/[^\d.,]/g, '')), setDone(undefined), setApproved(false))}
                  placeholder="0.00"
                  className="num min-h-12 min-w-0 flex-1 border border-accent bg-transparent px-4 text-[18px] text-ink outline-none focus-visible:shadow-[0_0_0_2px_#fff]"
                />
                <button
                  type="button"
                  disabled={!max}
                  onClick={() => max && setRaw(formatUnits(max, USDG_DECIMALS))}
                  className="min-h-12 border border-line-2 px-4 font-mono text-[15px] hover:border-accent disabled:opacity-50"
                >
                  Max
                </button>
              </div>

              {pos && amount > 0n && !block && (
                <p className="mt-5 text-[16px] leading-relaxed text-body">
                  {mode === 'deposit' ? (
                    <>
                      Your wallet {shortAddress(address)} sends <b className="text-ink">{show(amount)} USDG</b> straight to the vault{' '}
                      {vault.name} ({shortAddress(v)}) and gets vault shares for it. Escorpio never holds it.{' '}
                      {needApprove && <>First the vault needs your OK to take exactly {show(amount)} USDG, then the deposit itself: two signatures.</>}
                    </>
                  ) : (
                    <>
                      The vault sends <b className="text-ink">{show(amount)} USDG</b> back to your wallet {shortAddress(address)}. One signature.
                    </>
                  )}
                </p>
              )}

              <p className="mt-3 min-h-6 text-[15px]" aria-live="polite">
                {block ? (
                  <span className="text-antares-ink">{block}</span>
                ) : sim === undefined ? (
                  pos && amount > 0n ? <span className="text-muted">Simulating on chain…</span> : null
                ) : sim.ok ? (
                  <span className="text-accent">
                    Simulation passed:{' '}
                    {mode === 'deposit' ? `you would get ${formatUnits(sim.out, 18).slice(0, 12)} vault shares.` : `you would get ${show(sim.out)} USDG.`}
                  </span>
                ) : (
                  <span className="text-antares-ink">Simulation failed: {sim.why}</span>
                )}
              </p>

              <div className="mt-5 flex flex-wrap gap-3">
                {mode === 'deposit' ? (
                  needApprove ? (
                    <button type="button" className="button" disabled={!sim?.ok || !!busy} onClick={() => void approve()}>
                      1. Allow {amount > 0n ? show(amount) : ''} USDG
                    </button>
                  ) : (
                    <button type="button" className="button" disabled={!sim?.ok || !!busy} onClick={() => void deposit()}>
                      {approved ? '2. ' : ''}Deposit
                    </button>
                  )
                ) : (
                  <button type="button" className="button" disabled={!sim?.ok || !!busy} onClick={() => void withdraw()}>
                    Withdraw
                  </button>
                )}
              </div>

              <p className="mt-4 min-h-6 text-[15px]" aria-live="polite">
                {busy ? <span className="text-body">{busy}…</span> : err ? <span className="text-antares-ink">{err}</span> : null}
              </p>
              {done && (
                <p className="text-[15px] text-accent">
                  {done.text}{' '}
                  <a href={txUrl(done.hash)} target="_blank" rel="noopener noreferrer" className="accent-link">
                    See the transaction
                  </a>
                </p>
              )}
            </>
          )}
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <WalletLine />
          <p className="mt-2 text-[13px] text-muted">
            Rates change every block; the shares can be worth less if the vault takes a loss. Not financial advice.
          </p>
        </div>
      </div>
    </dialog>
  )
}

