import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { Address } from 'viem'
import { PageHead } from '@/components/page-head'
import { SwitchChain, WalletLine, WalletPicker } from '@/components/wallet-picker'
import { EXPLORER, USDG } from '@/data/morpho'
import { publicClient, shortAddress } from '@/lib/chain'
import { expired, fromQuery, simulatePay, toQuery, verifyRequest } from '@/lib/receive'
import { showUnits, useTx } from '@/lib/use-tx'
import { useWallet } from '@/lib/use-wallet'
import { erc20Abi, plainError, USDG_DECIMALS } from '@/lib/vault-tx'

// /pay?to=…&amount=…&ref=…&sig=…: a payment link from /receive. The page checks the payee signed exactly this request,
// then the payer sends a plain USDG transfer from their own wallet straight to the payee. Simulated before signing.
type Check = 'checking' | 'valid' | 'invalid' | 'down' // down: Robinhood Chain did not answer, nothing is known yet
type Sim = { ok: true } | { ok: false; why: string } | undefined
const U = (v: bigint) => showUnits(v, USDG_DECIMALS)

export function PayPage() {
  const search = typeof location === 'undefined' ? '' : location.search
  const parsed = useMemo(() => fromQuery(search), [search])
  const req = parsed.ok ? parsed.req : undefined
  const navigate = useNavigate()
  const { address, onRobinhood } = useWallet()
  const [check, setCheck] = useState<Check>('checking')
  const [tryAgain, setTryAgain] = useState(0)
  const [bal, setBal] = useState<{ usdg: bigint; eth: bigint }>()
  const [readErr, setReadErr] = useState(false)
  const [sim, setSim] = useState<Sim>()
  const isExpired = !!req && expired(req, Math.floor(Date.now() / 1000))

  useEffect(() => {
    if (!req) return
    let live = true
    setCheck('checking')
    verifyRequest(publicClient, req)
      .then((ok) => live && setCheck(ok ? 'valid' : 'invalid'))
      .catch(() => live && setCheck('down'))
    return () => {
      live = false
    }
  }, [req, tryAgain])

  const refresh = useCallback(async () => {
    if (!address) return
    setReadErr(false)
    try {
      const [usdg, eth] = await Promise.all([
        publicClient.readContract({ address: USDG as Address, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
        publicClient.getBalance({ address }),
      ])
      setBal({ usdg, eth })
    } catch {
      setReadErr(true)
    }
  }, [address])
  const ready = !!address && onRobinhood
  useEffect(() => {
    if (ready) void refresh()
  }, [ready, refresh])

  const self = !!req && !!address && address.toLowerCase() === req.to.toLowerCase()
  const block = !req || !bal ? undefined
    : self ? 'This link pays the wallet you are connected with. Connect the paying wallet instead.'
    : bal.usdg < req.amount ? `Your wallet holds ${U(bal.usdg)} USDG.`
    : bal.eth === 0n ? 'Your wallet has no ETH on Robinhood Chain for the network fee. Add a little first.'
    : undefined
  const canPay = check === 'valid' && !isExpired

  useEffect(() => {
    setSim(undefined)
    if (!req || !address || !bal || block || !canPay) return
    let live = true
    simulatePay(publicClient, address, req)
      .then(() => live && setSim({ ok: true }))
      .catch((e) => live && setSim({ ok: false, why: plainError(e) }))
    return () => {
      live = false
    }
  }, [req, address, bal, block, canPay])

  const { busy, err, send } = useTx(refresh)
  const pay = async () => {
    if (!req || !address) return
    const hash = await send('Paying', () => simulatePay(publicClient, address, req))
    if (hash) navigate(`/receipt?tx=${hash}&${toQuery(req)}`)
  }

  if (!req) {
    return (
      <main className="wrap pb-28 pt-[130px] lg:pt-[180px]">
        <PageHead kicker="Pay" title="This payment link does not work">
          {parsed.ok ? '' : parsed.why} Ask whoever sent it for a new link made on Escorpio's Receive page.
        </PageHead>
      </main>
    )
  }

  return (
    <main className="wrap pb-28 pt-[130px] lg:pt-[180px]">
      <PageHead kicker="Pay" title={`Pay ${U(req.amount)} USDG`}>
        A payment request made on Escorpio. The USDG goes from your wallet straight to the address below; Escorpio never
        holds it. Check the address with the person who sent you this link.
      </PageHead>

      <div className="mt-14 grid max-w-4xl gap-8 lg:grid-cols-[1fr_1fr]">
        <section aria-label="The request" className="border border-line-2 p-6 sm:p-8">
          <dl className="grid gap-5 text-[15px]">
            <div>
              <dt className="label">Pay to</dt>
              <dd className="num mt-1 break-all text-[17px] text-ink">{req.to}</dd>
              <dd className="mt-1">
                <a href={`${EXPLORER}/address/${req.to}`} target="_blank" rel="noopener noreferrer" className="accent-link text-sm">
                  See this address on Blockscout
                </a>
              </dd>
            </div>
            <div>
              <dt className="label">Amount</dt>
              <dd className="num mt-1 text-[2rem] leading-none text-accent">{U(req.amount)} USDG</dd>
            </div>
            {req.memo && (
              <div>
                <dt className="label">For</dt>
                <dd className="mt-1 text-ink">{req.memo}</dd>
              </div>
            )}
            <div>
              <dt className="label">Valid until</dt>
              <dd className="num mt-1 text-ink">{req.expires ? new Date(Number(req.expires) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'No end date'}</dd>
            </div>
            <div>
              <dt className="label">Reference</dt>
              <dd className="num mt-1 text-body">{req.ref}</dd>
            </div>
          </dl>
          <p role="status" className="mt-6 border-t border-line pt-4 text-[15px]">
            {check === 'checking' ? (
              <span className="text-muted">Checking the signature…</span>
            ) : check === 'down' ? (
              <span className="text-body">
                Could not check the signature: Robinhood Chain did not answer.{' '}
                <button type="button" className="accent-link" onClick={() => setTryAgain((n) => n + 1)}>
                  Try again
                </button>
              </span>
            ) : check === 'valid' ? (
              <span className="text-accent">Signed by {shortAddress(req.to)}, the wallet being paid. Nothing in this link was changed.</span>
            ) : (
              <span className="text-antares-ink">
                The signature does not match. Someone changed this link, or it was not made on Escorpio. Do not pay it.
              </span>
            )}
          </p>
          {isExpired && <p className="mt-2 text-[15px] text-antares-ink">This link has expired. Ask for a new one.</p>}
        </section>

        <section aria-label="Pay" className="border border-line-2 p-6 sm:p-8">
          {!canPay ? (
            <p className="text-[16px] text-body">{check === 'checking' || check === 'down' ? 'Checking the link first…' : 'This link cannot be paid.'}</p>
          ) : !address ? (
            <WalletPicker lead="Connect the wallet you pay from. Escorpio reads its address and balance; you sign the payment in the wallet." />
          ) : !onRobinhood ? (
            <SwitchChain />
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
                  <dt className="label">USDG in your wallet</dt>
                  <dd className="mt-1 text-ink">{bal ? U(bal.usdg) : readErr ? 'no data yet' : 'Reading…'}</dd>
                </div>
                <div>
                  <dt className="label">After paying</dt>
                  <dd className="mt-1 text-ink">{bal && bal.usdg >= req.amount ? U(bal.usdg - req.amount) : '–'}</dd>
                </div>
              </dl>
              <p className="mt-5 text-[16px] leading-relaxed text-body">
                Your wallet {shortAddress(address)} sends <b className="text-ink">{U(req.amount)} USDG</b> straight to {shortAddress(req.to)}.
                One signature, no approval. The request's reference rides along in the transaction, so the receipt can show which
                request it paid.
              </p>
              <p className="mt-3 min-h-6 text-[15px]" aria-live="polite">
                {block ? (
                  <span className="text-antares-ink">{block}</span>
                ) : !bal ? null : sim === undefined ? (
                  <span className="text-muted">Simulating on chain…</span>
                ) : sim.ok ? (
                  <span className="text-accent">Simulation passed: {U(req.amount)} USDG would reach {shortAddress(req.to)}.</span>
                ) : (
                  <span className="text-antares-ink">Simulation failed: {sim.why}</span>
                )}
              </p>
              <button type="button" className="button mt-5" disabled={!sim?.ok || !!busy} onClick={() => void pay()}>
                Pay {U(req.amount)} USDG
              </button>
              <p className="mt-4 min-h-6 text-[15px]" aria-live="polite">
                {busy ? <span className="text-body">{busy}…</span> : err ? <span className="text-antares-ink">{err}</span> : null}
              </p>
              <div className="mt-4 border-t border-line pt-4">
                <WalletLine />
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  )
}
