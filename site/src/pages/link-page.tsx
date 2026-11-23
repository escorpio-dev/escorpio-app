import { useState } from 'react'
import { PageHead } from '@/components/page-head'
import { WalletLine, WalletPicker } from '@/components/wallet-picker'
import { ALERTS_API, ALERTS_BOT, linkMessage } from '@/data/alerts-link'
import { useWallet, walletClient } from '@/lib/use-wallet'

// /link?code=…: links a wallet to an Escorpio alerts chat on Telegram. The bot hands out the code (/link); here the
// wallet signs one plain message (a signature, never a transaction) and the alerts Worker checks it and reads the
// wallet's $ESCORPIO balance to set the plan. Nothing is approved, sent or spent.
type Result = { ok: true; tier: 'holder' | 'free' } | { ok: false; error: string }

export function LinkPage() {
  const code = new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('code') ?? ''
  const valid = /^[A-Za-z0-9]{12}$/.test(code)
  const { address } = useWallet()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  const sign = async () => {
    if (!address) return
    setBusy(true)
    setResult(null)
    try {
      const signature = await walletClient().signMessage({ account: address, message: linkMessage(code, address) })
      const res = await fetch(`${ALERTS_API}/link`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, address, signature }),
      })
      const json = (await res.json().catch(() => ({}))) as { tier?: 'holder' | 'free'; error?: string }
      setResult(res.ok && json.tier ? { ok: true, tier: json.tier } : { ok: false, error: json.error ?? `The alerts service answered ${res.status}.` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setResult({ ok: false, error: /reject|denied|cancel/i.test(msg) ? 'You cancelled the signature. Nothing was linked.' : msg.slice(0, 200) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="wrap pb-28 pt-[130px] lg:pt-[180px]">
      <PageHead kicker="Rate alerts" title="Link your wallet">
        Holders of $ESCORPIO get more rate alerts on Telegram, checked every minute, plus a daily digest. Link the wallet that
        holds it by signing one message. It is a signature, not a transaction: it costs nothing and moves nothing.
      </PageHead>

      <div className="mt-14 max-w-2xl border border-line-2 p-6 sm:p-8">
        {!valid ? (
          <p className="text-body">
            This page needs a code from the bot. Send <code className="num text-ink">/link</code> to{' '}
            <a href={`https://t.me/${ALERTS_BOT}`} className="accent-link" target="_blank" rel="noopener noreferrer">
              @{ALERTS_BOT}
            </a>{' '}
            and open the link it sends you.
          </p>
        ) : !address ? (
          <>
            <WalletPicker lead="Connect the wallet that holds $ESCORPIO. Escorpio only reads its address and asks for one signature." />
          </>
        ) : (
          <>
            <WalletLine />
            <p className="label mt-6 mb-2">You will sign</p>
            <pre className="num whitespace-pre-wrap break-words border border-line-2 p-4 text-[13px] leading-relaxed text-body">
              {linkMessage(code, address)}
            </pre>
            <button type="button" className="button mt-6" onClick={sign} disabled={busy || result?.ok}>
              {busy ? 'Waiting for your wallet…' : 'Sign and link'}
            </button>
            {result && (
              <p role="status" className={`mt-5 ${result.ok ? 'text-ink' : 'text-antares-ink'}`}>
                {result.ok
                  ? result.tier === 'holder'
                    ? 'Linked. Your plan is holder: 10 alerts, checked every minute, and the daily digest. The bot has sent you a message.'
                    : 'Linked, but this wallet holds less than the holder threshold right now. Your plan stays free; it is checked again every day.'
                  : result.error}
              </p>
            )}
          </>
        )}
        <p className="mt-8 text-sm text-muted">
          Escorpio never asks for a seed phrase or a private key, and this page never asks you to approve or send anything.
          The link expires 15 minutes after the bot sends it.
        </p>
      </div>
    </main>
  )
}
