import { useState } from 'react'
import { Link } from 'react-router'
import { PageHead } from '@/components/page-head'
import { SwitchChain, WalletLine, WalletPicker } from '@/components/wallet-picker'
import { shortAddress } from '@/lib/chain'
import { MEMO_MAX, newRef, toQuery, typedData, type Request } from '@/lib/receive'
import { showUnits, toUnits } from '@/lib/use-tx'
import { useWallet, walletClient } from '@/lib/use-wallet'
import { USDG_DECIMALS } from '@/lib/vault-tx'

// /receive: the payee makes a payment link. Their wallet signs the request (EIP-712, a signature, never a
// transaction); the link carries the request and the signature, so nothing is stored anywhere. The payer opens it on
// /pay and sends USDG straight to the payee's wallet.
const VALID: [string, number][] = [
  ['7 days', 7],
  ['30 days', 30],
  ['No end date', 0],
]

export function ReceivePage() {
  const { address, onRobinhood } = useWallet()
  const [raw, setRaw] = useState('')
  const [memo, setMemo] = useState('')
  const [days, setDays] = useState(30)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string>()
  const [url, setUrl] = useState<string>()
  const [copied, setCopied] = useState(false)
  const amount = toUnits(raw, USDG_DECIMALS)
  const memoClean = memo.replace(/\s+/g, ' ').trim()
  const until = days ? new Date(Date.now() + days * 86_400_000) : undefined

  const sign = async () => {
    if (!address || amount === 0n) return
    setErr(undefined)
    setBusy(true)
    try {
      const req: Request = {
        to: address,
        amount,
        memo: memoClean,
        ref: newRef(),
        expires: until ? BigInt(Math.floor(until.getTime() / 1000)) : 0n,
      }
      const sig = await walletClient().signTypedData({ account: address, ...typedData(req) })
      setUrl(`${location.origin}/pay?${toQuery({ ...req, sig })}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(/reject|denied|cancel/i.test(msg) ? 'You cancelled the signature. No link was made.' : msg.slice(0, 200))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const reset = () => (setUrl(undefined), setRaw(''), setMemo(''), setCopied(false))

  return (
    <main className="wrap pb-28 pt-[130px] lg:pt-[180px]">
      <PageHead kicker="Receive" title="Get paid in USDG with a link">
        Type an amount, sign it with the wallet that should be paid, and send the link to whoever pays you. They see exactly
        what you signed, pay from their own wallet straight to yours, and both of you get a receipt read from the chain.
      </PageHead>

      <div className="mt-14 max-w-2xl border border-line-2 p-6 sm:p-8">
        {!address ? (
          <WalletPicker lead="Connect the wallet that should receive the USDG. You only sign the request: it costs nothing and moves nothing." />
        ) : !onRobinhood ? (
          <SwitchChain />
        ) : url ? (
          <>
            <p className="label">Your payment link</p>
            <p className="mt-2 text-[16px] text-body">
              <b className="text-ink">{showUnits(amount, USDG_DECIMALS)} USDG</b> to {shortAddress(address)}
              {memoClean && <> for “{memoClean}”</>}
              {until ? <>, valid until {until.toISOString().slice(0, 10)}</> : <>, no end date</>}.
            </p>
            <div className="mt-4 flex gap-2">
              <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Payment link" className="field num min-w-0 flex-1 px-3 text-[13px]" />
              <button type="button" className="button" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="mt-4 text-sm text-muted">
              Anyone with this link sees the amount, the memo and your wallet address. Changing any of them breaks your signature,
              and the pay page then refuses it.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <a href={url} className="accent-link text-sm">
                Open the pay page
              </a>
              <button type="button" className="accent-link text-sm" onClick={reset}>
                Make another link
              </button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="rx-amount" className="label block">
              USDG to receive
            </label>
            <input
              id="rx-amount"
              inputMode="decimal"
              autoComplete="off"
              value={raw}
              onChange={(e) => setRaw(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0.00"
              className="num mt-2 min-h-12 w-full border border-accent bg-transparent px-4 text-[18px] text-ink outline-none focus-visible:shadow-[0_0_0_2px_#fff]"
            />

            <label htmlFor="rx-memo" className="label mt-6 block">
              What it is for (optional)
            </label>
            <input
              id="rx-memo"
              autoComplete="off"
              maxLength={MEMO_MAX}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="Invoice 7, design work"
              className="field mt-2 min-h-12 w-full px-4 text-[16px]"
            />
            <p className="mt-1 text-right text-[12px] text-muted">
              {memo.length}/{MEMO_MAX}
            </p>

            <fieldset className="mt-4">
              <legend className="label">Link works for</legend>
              <div className="mt-2 grid grid-cols-3 border border-line-2">
                {VALID.map(([name, d]) => (
                  <label key={d} className={`flex min-h-11 cursor-pointer items-center justify-center font-mono text-[14px] ${days === d ? 'bg-accent text-on-accent' : 'text-ink hover:text-accent'}`}>
                    <input type="radio" name="rx-valid" className="sr-only" checked={days === d} onChange={() => setDays(d)} />
                    {name}
                  </label>
                ))}
              </div>
            </fieldset>

            {amount > 0n && (
              <p className="mt-6 text-[16px] leading-relaxed text-body">
                Your wallet {shortAddress(address)} signs a request for <b className="text-ink">{showUnits(amount, USDG_DECIMALS)} USDG</b>
                {memoClean && <> for “{memoClean}”</>}, paid to this same wallet
                {until ? <>, valid until {until.toISOString().slice(0, 10)}</> : null}. It is a signature, not a transaction.
              </p>
            )}

            <button type="button" className="button mt-6" disabled={amount === 0n || busy} onClick={() => void sign()}>
              {busy ? 'Waiting for your wallet…' : 'Sign and make the link'}
            </button>
            {err && (
              <p role="status" className="mt-4 text-[15px] text-antares-ink">
                {err}
              </p>
            )}
          </>
        )}

        <div className="mt-8 border-t border-line pt-4">
          {address && <WalletLine />}
          <p className="mt-2 text-[13px] text-muted">
            The payer sends USDG from their wallet straight to yours; Escorpio never holds it and stores nothing about the link.
            Ask the payer for their receipt link, or look the payment up on the explorer. <Link to="/method" className="accent-link">How it works</Link>
          </p>
        </div>
      </div>
    </main>
  )
}
