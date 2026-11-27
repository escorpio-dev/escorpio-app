import { useEffect, useMemo, useState } from 'react'
import type { Hash } from 'viem'
import { PageHead } from '@/components/page-head'
import { publicClient, shortAddress, txUrl } from '@/lib/chain'
import { fromQuery, matches, readReceipt, verifyRequest, type Receipt } from '@/lib/receive'
import { showUnits } from '@/lib/use-tx'
import { USDG_DECIMALS } from '@/lib/vault-tx'

// /receipt?tx=0x…[&request fields]: everything here is read from Robinhood Chain, nothing from Escorpio. With the
// request in the link it also says whether this transaction paid that request (payee, exact amount, reference).
const U = (v: bigint) => showUnits(v, USDG_DECIMALS)
const when = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

export function ReceiptPage() {
  const search = typeof location === 'undefined' ? '' : location.search
  const tx = useMemo(() => new URLSearchParams(search).get('tx') ?? '', [search])
  const validTx = /^0x[0-9a-fA-F]{64}$/.test(tx)
  const parsed = useMemo(() => fromQuery(search), [search])
  const req = parsed.ok ? parsed.req : undefined
  const [rc, setRc] = useState<Receipt | null>()
  const [signed, setSigned] = useState<boolean | 'down'>() // down: Robinhood Chain did not answer
  const [down, setDown] = useState(false) // the last read failed because the chain did not answer
  const [tries, setTries] = useState(0)

  // A fresh payment may not be on chain yet: look again every 3 s, up to 40 tries (2 minutes).
  useEffect(() => {
    if (!validTx) return
    let live = true
    let timer: ReturnType<typeof setTimeout>
    const look = async (n: number) => {
      let r
      try {
        r = await readReceipt(publicClient, tx as Hash)
        setDown(false)
      } catch {
        setDown(true)
      }
      if (!live) return
      setTries(n)
      if (r) return setRc(r)
      if (n >= 40) return setRc(null)
      timer = setTimeout(() => void look(n + 1), 3000)
    }
    void look(1)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [tx, validTx])

  useEffect(() => {
    if (!req) return
    let live = true
    verifyRequest(publicClient, req)
      .then((ok) => live && setSigned(ok))
      .catch(() => live && setSigned('down'))
    return () => {
      live = false
    }
  }, [req])

  if (!validTx) {
    return (
      <main className="wrap pb-28 pt-[130px] lg:pt-[180px]">
        <PageHead kicker="Receipt" title="This receipt link has no transaction">
          A receipt link ends with the transaction hash of the payment. Ask the payer for the link the pay page gave them.
        </PageHead>
      </main>
    )
  }

  const m = rc && req ? matches(rc, req) : undefined
  return (
    <main className="wrap pb-28 pt-[130px] lg:pt-[180px]">
      <PageHead kicker="Receipt" title={rc === undefined ? 'Looking for the payment' : rc === null ? 'Payment not found yet' : rc.ok ? 'Payment on chain' : 'This transaction failed'}>
        Read straight from Robinhood Chain. Escorpio stores nothing about payments; anyone with this link sees the same
        thing on the explorer.
      </PageHead>

      <section aria-label="Receipt" className="mt-14 max-w-2xl border border-line-2 p-6 sm:p-8">
        {rc === undefined ? (
          <p role="status" className="text-[16px] text-body">
            Reading the transaction{tries > 1 ? ` (try ${tries} of 40, a new payment can take a few seconds)` : ''}…
          </p>
        ) : rc === null ? (
          <p role="status" className="text-[16px] text-body">
            {down
              ? 'Robinhood Chain did not answer for 2 minutes, so this payment could not be read. Reload this page later or check it on the explorer.'
              : 'Robinhood Chain has no transaction with this hash after 2 minutes. If the wallet showed it as sent, reload this page later or check it on the explorer.'}
          </p>
        ) : (
          <>
            {req && m && (
              <p role="status" className={`mb-6 border-b border-line pb-4 text-[16px] ${m.paid && signed === true ? 'text-accent' : signed === 'down' ? 'text-body' : 'text-antares-ink'}`}>
                {signed === 'down'
                  ? 'Could not check the payee signature just now: Robinhood Chain did not answer. Reload the page to try again.'
                  : signed === false
                  ? 'The request in this link is not signed by the payee, so it proves nothing about what was asked.'
                  : m.paid
                    ? `Paid: ${U(req.amount)} USDG reached ${shortAddress(req.to)}${m.refMatch ? ', and the reference matches this request.' : '. The reference in the transaction does not match this request.'}`
                    : `This transaction does not pay the request: no ${U(req.amount)} USDG transfer to ${shortAddress(req.to)} in it.`}
              </p>
            )}
            <dl className="grid gap-5 text-[15px]">
              <div>
                <dt className="label">Status</dt>
                <dd className={`mt-1 ${rc.ok ? 'text-ink' : 'text-antares-ink'}`}>{rc.ok ? 'Succeeded' : 'Failed, nothing moved'}</dd>
              </div>
              <div>
                <dt className="label">When</dt>
                <dd className="num mt-1 text-ink">
                  {when(rc.time)}, block {rc.block.toString()}
                </dd>
              </div>
              <div>
                <dt className="label">Sent by</dt>
                <dd className="num mt-1 break-all text-ink">{rc.from}</dd>
              </div>
              <div>
                <dt className="label">USDG moved</dt>
                {rc.transfers.length ? (
                  rc.transfers.map((t, i) => (
                    <dd key={i} className="num mt-1 text-ink">
                      {U(t.value)} USDG, {shortAddress(t.from)} to {shortAddress(t.to)}
                    </dd>
                  ))
                ) : (
                  <dd className="mt-1 text-body">No USDG moved in this transaction.</dd>
                )}
              </div>
              {req?.memo && (
                <div>
                  <dt className="label">For</dt>
                  <dd className="mt-1 text-ink">{req.memo}</dd>
                </div>
              )}
              <div>
                <dt className="label">Reference in the transaction</dt>
                <dd className="num mt-1 text-body">{rc.ref ?? 'none'}</dd>
              </div>
              <div>
                <dt className="label">Transaction</dt>
                <dd className="num mt-1 break-all text-body">{rc.hash}</dd>
              </div>
            </dl>
          </>
        )}
        <p className="mt-6 border-t border-line pt-4 text-sm">
          <a href={txUrl(tx)} target="_blank" rel="noopener noreferrer" className="accent-link">
            Open this transaction on Blockscout
          </a>
        </p>
      </section>
    </main>
  )
}
