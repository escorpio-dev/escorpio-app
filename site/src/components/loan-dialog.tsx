import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { type Address, type Hash, type Hex } from 'viem'
import { RiskNotes } from '@/components/risk-notes'
import { SwitchChain, WalletLine, WalletPicker } from '@/components/wallet-picker'
import { marketNotes } from '@/data/desk'
import { MORPHO_BLUE, type Market } from '@/data/morpho'
import { publicClient, shortAddress, txUrl } from '@/lib/chain'
import { pct, usd } from '@/lib/format'
import {
  borrowLimit,
  collateralValue,
  liquidationPrice,
  positionOverride,
  pricePerToken,
  readLoan,
  simulateApproveToken,
  simulateBorrow,
  simulateRepay,
  simulateSupplyCollateral,
  simulateWithdrawCollateral,
  repayMax,
  type Loan,
} from '@/lib/loan-tx'
import { showUnits, toUnits, useTx } from '@/lib/use-tx'
import { useWallet } from '@/lib/use-wallet'
import { USDG_DECIMALS, plainError, usdgOverride } from '@/lib/vault-tx'

// Borrow USDG against a token on one Morpho market, from the user's own wallet. Every step says what it does in plain
// words, is simulated on chain, and only then goes to the wallet. Escorpio stops at 90% of the market's liquidation
// line: a loan right at the line is liquidated by the next small price move.

type Mode = 'borrow' | 'repay' | 'collateral'
type Sim = { ok: true; note: string } | { ok: false; why: string } | undefined
const CAP = 90n // percent of the liquidation line Escorpio lets a loan reach
const WARN = 80n
const BLUE = MORPHO_BLUE as Address
const U = (v: bigint) => showUnits(v, USDG_DECIMALS)
// Interest keeps building while the user signs, so a full repayment needs a little more allowance than today's debt.
const withMargin = (debt: bigint) => debt + debt / 2000n + 10n

export function LoanDialog({ market, symbol, readAt, onClose }: { market: Market; symbol: string; readAt: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { address, onRobinhood } = useWallet()
  const [mode, setMode] = useState<Mode>('borrow')
  const [rawColl, setRawColl] = useState('')
  const [rawUsdg, setRawUsdg] = useState('')
  const [loan, setLoan] = useState<Loan>()
  const [readErr, setReadErr] = useState(false)
  const [sim, setSim] = useState<Sim>()
  const [done, setDone] = useState<{ hash: Hash; text: string }>()
  const id = market.id as Hex
  const notes = marketNotes(market, readAt)
  const stop = notes.some((n) => n.stop)
  const ready = !!address && onRobinhood

  useEffect(() => {
    ref.current?.showModal()
  }, [])
  const refresh = useCallback(async () => {
    if (!address) return
    setReadErr(false)
    try {
      setLoan(await readLoan(publicClient, address, id))
    } catch {
      setReadErr(true)
    }
  }, [address, id])
  useEffect(() => {
    if (ready) void refresh()
  }, [ready, refresh])
  const { busy, err, setErr, send } = useTx(refresh)

  const dec = loan?.collDecimals ?? 18
  const coll = toUnits(rawColl, dec)
  const usdgAmt = toUnits(rawUsdg, USDG_DECIMALS)
  const C = (v: bigint) => showUnits(v, dec, 2)

  // The loan as it would be after this action.
  const after = (() => {
    if (!loan) return undefined
    const collateral = mode === 'borrow' ? loan.collateral + coll : mode === 'collateral' ? loan.collateral - (coll > loan.collateral ? loan.collateral : coll) : loan.collateral
    const debt = mode === 'borrow' ? loan.debt + usdgAmt : mode === 'repay' ? (usdgAmt >= loan.debt ? 0n : loan.debt - usdgAmt) : loan.debt
    const limit = borrowLimit(collateral, loan.price, loan.params.lltv)
    return { collateral, debt, limit, used: limit ? Number((debt * 10_000n) / limit) / 100 : debt ? Infinity : 0 }
  })()
  const capRoom = loan && after ? (borrowLimit(after.collateral, loan.price, loan.params.lltv) * CAP) / 100n - loan.debt : 0n

  // What stops the action before anything is simulated.
  const block = (() => {
    if (!loan || !after) return undefined
    if (mode === 'borrow') {
      if (coll === 0n && usdgAmt === 0n) return undefined
      if (coll > loan.walletColl) return `Your wallet holds ${C(loan.walletColl)} ${loan.collSymbol}.`
      if (after.debt > (after.limit * CAP) / 100n) return `That is past ${CAP}% of the liquidation line. With this collateral you can borrow up to ${U(capRoom > 0n ? capRoom : 0n)} USDG here.`
    }
    if (mode === 'repay') {
      if (usdgAmt === 0n) return undefined
      if (loan.debt === 0n) return 'You owe nothing in this market.'
      const need = usdgAmt >= loan.debt ? loan.debt : usdgAmt
      if (need > loan.walletUsdg) return `Your wallet holds ${U(loan.walletUsdg)} USDG.`
    }
    if (mode === 'collateral') {
      if (coll === 0n) return undefined
      if (coll > loan.collateral) return `You have ${C(loan.collateral)} ${loan.collSymbol} in this market.`
      if (after.debt > (after.limit * CAP) / 100n) return `Taking that much back would put the loan past ${CAP}% of the liquidation line. Repay first.`
    }
    if (loan.eth === 0n) return 'Your wallet has no ETH on Robinhood Chain for the network fee. Add a little first.'
    return undefined
  })()

  // Steps still to sign, in order.
  const repayAll = mode === 'repay' && !!loan && loan.debt > 0n && usdgAmt >= loan.debt
  const repayPull = loan ? (repayAll ? withMargin(loan.debt) : usdgAmt) : 0n
  const steps: { key: string; label: string; run: () => Promise<Hash | undefined>; text: string }[] = []
  if (loan && address && !block) {
    const p = loan.params
    if (mode === 'borrow') {
      if (coll > 0n && loan.collAllowance < coll)
        steps.push({ key: 'approve', label: `Allow ${C(coll)} ${loan.collSymbol}`, text: '', run: () => send('Allowing', () => simulateApproveToken(publicClient, address, p.collateralToken, coll)) })
      if (coll > 0n)
        steps.push({ key: 'supply', label: `Put in ${C(coll)} ${loan.collSymbol}`, text: `Put ${C(coll)} ${loan.collSymbol} in as collateral.`, run: () => send('Putting in collateral', () => simulateSupplyCollateral(publicClient, address, p, coll)) })
      if (usdgAmt > 0n)
        steps.push({ key: 'borrow', label: `Borrow ${U(usdgAmt)} USDG`, text: `Borrowed ${U(usdgAmt)} USDG to your wallet.`, run: () => send('Borrowing', () => simulateBorrow(publicClient, address, p, usdgAmt)) })
    }
    if (mode === 'repay' && usdgAmt > 0n) {
      if (loan.usdgAllowance < repayPull)
        steps.push({ key: 'approve', label: `Allow ${U(repayPull)} USDG`, text: '', run: () => send('Allowing', () => simulateApproveToken(publicClient, address, p.loanToken, repayPull)) })
      steps.push({
        key: 'repay',
        label: repayAll ? 'Repay all' : `Repay ${U(usdgAmt)} USDG`,
        text: repayAll ? 'Loan repaid in full.' : `Repaid ${U(usdgAmt)} USDG.`,
        run: () => send('Repaying', () => simulateRepay(publicClient, address, p, repayAll ? { shares: loan.borrowShares } : { assets: usdgAmt })),
      })
    }
    if (mode === 'collateral' && coll > 0n)
      steps.push({ key: 'withdraw', label: `Take back ${C(coll)} ${loan.collSymbol}`, text: `${C(coll)} ${loan.collSymbol} back in your wallet.`, run: () => send('Taking collateral back', () => simulateWithdrawCollateral(publicClient, address, p, coll)) })
  }
  const next = steps[0]
  const stepKeys = steps.map((s) => s.key).join(',')

  // Simulate the end result as the user types. Before the collateral is in, the borrow is simulated as if it were
  // (Morpho Blue position override); before the USDG approval exists, the repay is simulated as if it did.
  useEffect(() => {
    setSim(undefined)
    if (!address || !loan || !stepKeys || block) return
    const t = setTimeout(async () => {
      const p = loan.params
      try {
        if (mode === 'borrow') {
          if (usdgAmt > 0n) {
            await simulateBorrow(publicClient, address, p, usdgAmt, coll > 0n ? positionOverride(id, address, loan.collateral + coll, loan.borrowShares) : undefined)
            setSim({ ok: true, note: `the borrow of ${U(usdgAmt)} USDG would go through${coll > 0n ? ' once the collateral is in' : ''}.` })
          } else if (loan.collAllowance >= coll) {
            await simulateSupplyCollateral(publicClient, address, p, coll)
            setSim({ ok: true, note: `putting in ${C(coll)} ${loan.collSymbol} would go through.` })
          } else {
            await simulateApproveToken(publicClient, address, p.collateralToken, coll)
            setSim({ ok: true, note: `the approval would go through; the deposit itself is simulated again after it.` })
          }
        } else if (mode === 'repay') {
          const ov = loan.usdgAllowance < repayPull ? usdgOverride(address, BLUE, repayPull) : undefined
          const { result } = await simulateRepay(publicClient, address, p, repayAll ? { shares: loan.borrowShares } : { assets: usdgAmt }, ov)
          setSim({ ok: true, note: `${U(result[0])} USDG of debt would be repaid.` })
        } else {
          await simulateWithdrawCollateral(publicClient, address, p, coll)
          setSim({ ok: true, note: `${C(coll)} ${loan.collSymbol} would come back to your wallet.` })
        }
      } catch (e) {
        setSim({ ok: false, why: plainError(e) })
      }
    }, 400)
    return () => clearTimeout(t)
  }, [address, loan, stepKeys, block, mode, coll, usdgAmt, repayAll, repayPull, id])

  async function runNext() {
    if (!next) return
    const hash = await next.run()
    if (!hash) return
    if (next.key === 'supply') setRawColl('')
    if (next.key !== 'approve') {
      setDone({ hash, text: next.text })
      if (next.key !== 'supply') (setRawColl(''), setRawUsdg(''))
    }
  }

  const switchMode = (m: Mode) => (setMode(m), setRawColl(''), setRawUsdg(''), setErr(undefined), setDone(undefined))
  const price = loan ? pricePerToken(loan.price, loan.collDecimals) : 0
  const liqNow = loan ? liquidationPrice(loan.debt, loan.collateral, loan.params.lltv, loan.collDecimals) : 0
  const liqAfter = loan && after ? liquidationPrice(after.debt, after.collateral, loan.params.lltv, loan.collDecimals) : 0
  const changing = coll > 0n || usdgAmt > 0n

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="loan-dialog-title"
      className="m-auto w-[min(600px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-y-auto border border-line-2 bg-bg p-0 text-ink backdrop:bg-black/75"
    >
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="label">Morpho market · {shortAddress(id)}</div>
            <h2 id="loan-dialog-title" className="mt-2 text-[24px] font-bold leading-tight">
              Borrow USDG against {symbol}
            </h2>
            <p className="num mt-1 text-[15px] text-body">
              {pct(market.borrowApy)} a year now · liquidation at {(market.lltv * 100).toFixed(1)}% · {usd(market.availableUsd)} free to borrow
            </p>
          </div>
          <button type="button" onClick={() => ref.current?.close()} className="min-h-11 min-w-11 border border-line-2 text-[20px] leading-none hover:border-accent" aria-label="Close">
            ×
          </button>
        </div>
        <div className="mt-4">
          <RiskNotes notes={notes} />
        </div>

        <div role="tablist" aria-label="Action" className="mt-6 grid grid-cols-3 border border-line-2">
          {(
            [
              ['borrow', 'Borrow'],
              ['repay', 'Repay'],
              ['collateral', 'Take back'],
            ] as const
          ).map(([m, name]) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              className={`min-h-11 font-mono text-[15px] ${mode === m ? 'bg-accent text-on-accent' : 'text-ink hover:text-accent'}`}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {!address ? (
            <WalletPicker />
          ) : !onRobinhood ? (
            <SwitchChain />
          ) : mode === 'borrow' && stop ? (
            <p className="text-[16px] text-antares-ink">This market has a stop flag right now (see above), so Escorpio does not offer new loans in it. You can still repay and take collateral back.</p>
          ) : (
            <>
              {readErr && (
                <p className="mb-4 text-[15px] text-antares-ink">
                  Could not read your position from Robinhood Chain.{' '}
                  <button type="button" onClick={() => void refresh()} className="accent-link">
                    Try again
                  </button>
                </p>
              )}
              <dl className="num grid grid-cols-2 gap-x-6 gap-y-3 text-[15px] sm:grid-cols-3">
                <Fact k={`${symbol} in wallet`} v={loan ? C(loan.walletColl) : readErr ? 'no data yet' : 'Reading…'} />
                <Fact k="USDG in wallet" v={loan ? U(loan.walletUsdg) : readErr ? 'no data yet' : 'Reading…'} />
                <Fact k={`${symbol} price (oracle)`} v={loan ? `$${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '…'} />
                <Fact k={`${symbol} put in here`} v={loan ? C(loan.collateral) : '…'} />
                <Fact k="You owe here" v={loan ? `${U(loan.debt)} USDG` : '…'} />
                <Fact k="Liquidated below" v={loan && loan.debt > 0n ? `$${liqNow.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : '-'} />
              </dl>

              {(mode === 'borrow' || mode === 'collateral') && (
                <Amount
                  id="loan-coll"
                  label={mode === 'borrow' ? `${symbol} to put in as collateral (optional if you already have some here)` : `${symbol} to take back`}
                  value={rawColl}
                  onChange={(x) => (setRawColl(x), setDone(undefined))}
                  max={loan ? (mode === 'borrow' ? loan.walletColl : loan.collateral) : undefined}
                  decimals={dec}
                />
              )}
              {(mode === 'borrow' || mode === 'repay') && (
                <Amount
                  id="loan-usdg"
                  label={mode === 'borrow' ? `USDG to borrow${loan ? ` (up to ${U(capRoom > 0n ? capRoom : 0n)} at ${CAP}% of the line)` : ''}` : 'USDG to repay'}
                  value={rawUsdg}
                  onChange={(x) => (setRawUsdg(x), setDone(undefined))}
                  max={loan ? (mode === 'borrow' ? (capRoom > 0n ? capRoom : 0n) : repayMax(loan)) : undefined}
                  decimals={USDG_DECIMALS}
                />
              )}

              {loan && after && changing && !block && (
                <div className="mt-5 border-l-2 border-line-2 pl-4 text-[16px] leading-relaxed text-body">
                  <p>
                    After this: <b className="text-ink">{C(after.collateral)} {loan.collSymbol}</b> in, <b className="text-ink">{U(after.debt)} USDG</b> owed,{' '}
                    {after.debt > 0n ? (
                      <>
                        <b className={after.used >= Number(WARN) ? 'text-antares-ink' : 'text-ink'}>{after.used.toFixed(0)}%</b> of the liquidation line used. If{' '}
                        {loan.collSymbol} falls below <b className="text-ink">${liqAfter.toLocaleString('en-US', { maximumFractionDigits: 2 })}</b> (now $
                        {price.toLocaleString('en-US', { maximumFractionDigits: 2 })}), anyone can sell your collateral to repay the loan.
                      </>
                    ) : (
                      'no loan open.'
                    )}
                  </p>
                  {after.debt > 0n && after.used >= Number(WARN) && (
                    <p className="mt-2 text-antares-ink">That is close to the line: a {Math.max(1, Math.round(100 - after.used))}% drop in {loan.collSymbol} would start a liquidation.</p>
                  )}
                  <p className="mt-2 text-[14px] text-muted">
                    Collateral worth {U(collateralValue(after.collateral, loan.price))} USDG at the oracle price. Everything goes between your wallet and Morpho
                    Blue ({shortAddress(BLUE)}); Escorpio never holds it.
                  </p>
                </div>
              )}

              {steps.length > 1 && (
                <ol className="mt-5 grid gap-1 text-[15px]">
                  {steps.map((s, i) => (
                    <li key={s.key} className={i === 0 ? 'text-ink' : 'text-muted'}>
                      <span className="num mr-2">{i + 1}.</span>
                      {s.label}
                    </li>
                  ))}
                </ol>
              )}

              <p className="mt-3 min-h-6 text-[15px]" aria-live="polite">
                {block ? (
                  <span className="text-antares-ink">{block}</span>
                ) : !next ? null : sim === undefined ? (
                  <span className="text-muted">Simulating on chain…</span>
                ) : sim.ok ? (
                  <span className="text-accent">Simulation passed: {sim.note}</span>
                ) : (
                  <span className="text-antares-ink">Simulation failed: {sim.why}</span>
                )}
              </p>

              {next && (
                <button type="button" className="button mt-4" disabled={!sim?.ok || !!busy} onClick={() => void runNext()}>
                  {steps.length > 1 ? `1. ${next.label}` : next.label}
                </button>
              )}
              {repayAll && next?.key === 'approve' && (
                <p className="mt-3 text-[14px] text-muted">The approval is your debt plus 0.05%, because interest keeps building while you sign. Only what you owe is taken.</p>
              )}

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
            The rate changes every block and the price comes from this market's oracle. A loan can be liquidated if the token falls. Not financial advice.
          </p>
        </div>
      </div>
    </dialog>
  )
}

function Fact({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <dt className="label">{k}</dt>
      <dd className="mt-1 text-ink">{v}</dd>
    </div>
  )
}

function Amount({ id, label, value, onChange, max, decimals }: { id: string; label: string; value: string; onChange: (v: string) => void; max?: bigint; decimals: number }) {
  return (
    <div className="mt-6">
      <label htmlFor={id} className="label block">
        {label}
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
          placeholder="0.00"
          className="num min-h-12 min-w-0 flex-1 border border-accent bg-transparent px-4 text-[18px] text-ink outline-none focus-visible:shadow-[0_0_0_2px_#fff]"
        />
        <button
          type="button"
          disabled={!max}
          onClick={() => max && onChange(trimUnits(max, decimals))}
          className="min-h-12 border border-line-2 px-4 font-mono text-[15px] hover:border-accent disabled:opacity-50"
        >
          Max
        </button>
      </div>
    </div>
  )
}

// Exact raw amount as text, so "Max" repays or takes back to the last unit.
const trimUnits = (v: bigint, decimals: number) => {
  const s = v.toString().padStart(decimals + 1, '0')
  const whole = s.slice(0, s.length - decimals)
  const frac = s.slice(s.length - decimals).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}
