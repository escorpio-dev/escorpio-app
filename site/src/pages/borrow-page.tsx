import { lazy, Suspense, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { DeskReadout } from '@/components/desk-readout'
import { PageHead } from '@/components/page-head'
import { RateAxis } from '@/components/rate-axis'
import { RiskNotes } from '@/components/risk-notes'
import { StatStrip } from '@/components/stat-strip'
import { TablePager } from '@/components/table-pager'
import { cheapest, collaterals, marketNotes, sharedSymbols } from '@/data/desk'
import { EXPLORER, type Market } from '@/data/morpho'
import { pct, short, usd, usdg } from '@/lib/format'
import { useDesk } from '@/lib/use-desk'
import { usePage } from '@/lib/use-page'

// The wallet code (viem) loads only when someone opens a market, so the rest of the site stays light.
const LoanDialog = lazy(() => import('@/components/loan-dialog').then((m) => ({ default: m.LoanDialog })))

export function BorrowPage() {
  const { desk, error } = useDesk()
  const [params, setParams] = useSearchParams()
  const [raw, setRaw] = useState('5000')
  const [sel, setSel] = useState<string | undefined>()
  const [open, setOpen] = useState<Market>()
  const amount = Math.max(0, Math.min(1e12, Number(raw.replace(/,/g, '')) || 0))

  const groups = useMemo(() => (desk ? collaterals(desk) : []), [desk])
  const dupes = useMemo(() => sharedSymbols(groups), [groups])
  const wanted = params.get('c')?.toLowerCase()
  const current = groups.find((g) => g.address.toLowerCase() === wanted) ?? groups.find((g) => g.symbol === 'NVDA') ?? groups[0]
  const best = desk && current ? cheapest(current, amount, desk.readAt) : undefined
  const selected = current?.markets.find((m) => m.id === sel)
  // Cheapest open market per collateral, then the lowest of those: the best rate a borrower can get today.
  const lows = desk ? groups.map((g) => ({ g, m: cheapest(g, 0, desk.readAt) })).filter((x) => x.m) : []
  const low = lows.reduce<(typeof lows)[number] | undefined>((a, b) => (!a || b.m!.borrowApy < a.m!.borrowApy ? b : a), undefined)

  const choose = (address: string) => {
    setSel(undefined)
    setParams({ c: address }, { replace: true })
  }

  return (
    <main className="wrap pb-28 pt-[130px] lg:pt-[180px]">
      <PageHead
        kicker="Borrow"
        title="Borrow USDG against what you hold"
        bg="bg-borrow"
      >
        Pick the token you would put up as collateral. You see every Morpho market on Robinhood Chain that lends USDG against
        it: the yearly rate, the loan-to-value at which you get liquidated, and how much USDG is actually free to borrow right
        now.
      </PageHead>

      {!desk && <p className="py-16 text-center text-muted">{error ? 'No data yet: the Morpho API did not answer.' : 'Reading the Morpho API…'}</p>}

      {desk && (
        <StatStrip
          stats={[
            { k: 'Cheapest open loan', v: low ? pct(low.m!.borrowApy) : 'no data yet', sub: low ? `against ${low.g.symbol}` : undefined },
            { k: 'Free to borrow', v: usd(desk.markets.reduce((s, m) => s + m.availableUsd, 0)), sub: 'USDG across every market' },
            { k: 'Collateral tokens', v: String(groups.length), sub: 'with $1k or more lent' },
            { k: 'Markets read', v: String(desk.markets.length), sub: 'Morpho markets lending USDG' },
          ]}
        />
      )}

      {desk && current && (
        <>
          <div className="mt-16">
            <div className="label mb-2">Collateral</div>
            <div role="tablist" aria-label="Collateral" className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:flex-wrap md:px-0">
              {groups.map((g) => {
                const on = g.address === current.address
                return (
                  <button
                    key={g.address}
                    role="tab"
                    aria-selected={on}
                    onClick={() => choose(g.address)}
                    title={g.name}
                    className={`-mb-px min-h-11 shrink-0 border-b-2 px-3 text-left transition-colors ${on ? 'border-line-2 text-ink' : 'border-transparent text-muted hover:text-ink'}`}
                  >
                    <span className="font-mono text-sm">{g.symbol}</span>
                    {dupes.has(g.symbol) && <span className="ml-1 font-mono text-[13px]">{short(g.address)}</span>}
                    <span className="num ml-2 text-[13px] text-muted">{usd(g.supplyUsd)}</span>
                  </button>
                )
              })}
            </div>
            <p className="mt-3 text-sm text-muted">
              {current.name} ·{' '}
              <a href={`${EXPLORER}/address/${current.address}`} target="_blank" rel="noopener noreferrer" className="accent-link num">
                {short(current.address)}
              </a>{' '}
              · check this address is the token you hold
            </p>
          </div>

          <section className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.5fr]" aria-label="Cheapest market">
            <div>
              <label className="field flex items-baseline gap-3 px-4 py-3">
                <span className="label shrink-0">I need</span>
                <input
                  inputMode="decimal"
                  value={raw}
                  onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, ''))}
                  className="num w-full min-w-0 bg-transparent text-[1.8rem] outline-none"
                  aria-label="USDG to borrow"
                />
                <span className="num shrink-0 text-muted">USDG</span>
              </label>
              <div className="mt-6 border-b-2 border-line-2 pb-4">
                <div className="label">Cheapest {current.symbol} market that can lend it now</div>
                {best ? (
                  <>
                    <div className="num mt-2 text-[3rem] leading-none text-accent">{pct(best.borrowApy)}</div>
                    <p className="mt-3 text-sm leading-relaxed text-body">
                      A year on {usdg(amount)} USDG at this rate is about <span className="num text-ink">{usdg(amount * best.borrowApy)}</span> USDG
                      if the rate held. Liquidation at {(best.lltv * 100).toFixed(1)}% LTV. {usd(best.availableUsd)} free in this market.
                    </p>
                  </>
                ) : (
                  <p className="mt-3 text-body">
                    No {current.symbol} market has {usdg(Math.max(amount, 1000))} USDG free to borrow right now. Try a smaller amount.
                  </p>
                )}
              </div>
              {best && (
                <div className="mt-4 flex items-center justify-between">
                  <button type="button" onClick={() => setSel(best.id)} className="accent-link text-sm">
                    Show it on the line
                  </button>
                  <LoanButton market={best} now={desk.readAt} symbol={current.symbol} onOpen={setOpen} />
                </div>
              )}
            </div>
            <div className="lg:pt-6">
              <div className="label mb-2">Borrow rate a year, every {current.symbol} market</div>
              <RateAxis markets={current.markets} lowId={best?.id} selectedId={selected?.id ?? best?.id} onSelect={setSel} />
            </div>
          </section>

          <MarketTable markets={current.markets} bestId={best?.id} selectedId={selected?.id} now={desk.readAt} symbol={current.symbol} onOpen={setOpen} />
          <DeskReadout className="mt-6" />
        </>
      )}
      {open && desk && current && (
        <Suspense fallback={null}>
          <LoanDialog market={open} symbol={current.symbol} readAt={desk.readAt} onClose={() => setOpen(undefined)} />
        </Suspense>
      )}
    </main>
  )
}

function MarketTable({
  markets,
  bestId,
  selectedId,
  now,
  symbol,
  onOpen,
}: {
  markets: Market[]
  bestId?: string
  selectedId?: string
  now: number
  symbol: string
  onOpen: (m: Market) => void
}) {
  const paged = usePage(markets, 10, symbol + markets.length)
  return (
    <div id="markets" className="mt-14 scroll-mt-28">
      <div className="flex items-baseline justify-between border-b border-line-2 pb-3">
        <h2 className="h-cond !text-[clamp(2rem,4vw,3rem)] text-[1.9rem]">All {symbol} markets</h2>
        <span className="label">{markets.length} markets, cheapest first</span>
      </div>
      <table className="hidden w-full text-left text-[16px] md:table">
        <caption className="sr-only">USDG markets with {symbol} as collateral</caption>
        <thead>
          <tr className="border-b border-line">
            {['Borrow rate', 'Liquidation at', 'Free to borrow', 'Supplied', 'Used', 'What to know', ''].map((h, i) => (
              <th key={h + i} scope="col" className={`label whitespace-nowrap py-3 font-normal ${i > 0 && i < 5 ? 'pl-6 text-right' : ''} ${i === 5 ? 'pl-8' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {paged.rows.map((m) => (
            <tr key={m.id} className={`border-b border-line align-top transition-colors hover:bg-card ${m.id === selectedId ? 'bg-band' : ''}`}>
              <td className="py-5">
                <div className={`num text-[24px] leading-none ${m.id === bestId ? 'text-accent' : 'text-ink'}`}>{pct(m.borrowApy)}</div>
                <div className="num mt-1.5 font-mono text-[13px] text-muted">{short(m.id)}</div>
              </td>
              <td className="num whitespace-nowrap py-5 pl-6 text-right">{(m.lltv * 100).toFixed(1)}%</td>
              <td className="num whitespace-nowrap py-5 pl-6 text-right">{usd(m.availableUsd)}</td>
              <td className="num whitespace-nowrap py-5 pl-6 text-right">{usd(m.supplyUsd)}</td>
              <td className="whitespace-nowrap py-5 pl-6 text-right">
                <UsedBar u={m.utilization} />
              </td>
              <td className="w-[280px] py-5 pl-8">
                <RiskNotes notes={marketNotes(m, now)} />
              </td>
              <td className="whitespace-nowrap py-5 pl-6 text-right">
                <LoanButton market={m} now={now} symbol={symbol} onOpen={onOpen} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ol className="md:hidden">
        {paged.rows.map((m) => (
          <li key={m.id} className={`border-b border-line py-5 ${m.id === selectedId ? 'bg-band' : ''}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className={`num text-2xl leading-none ${m.id === bestId ? 'text-accent' : ''}`}>{pct(m.borrowApy)}</div>
                <div className="num mt-1 text-[13px] text-muted">{short(m.id)}</div>
              </div>
              <LoanButton market={m} now={now} symbol={symbol} onOpen={onOpen} />
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[15px]">
              <div>
                <dt className="label">Liquidation at</dt>
                <dd className="num mt-0.5">{(m.lltv * 100).toFixed(1)}% LTV</dd>
              </div>
              <div>
                <dt className="label">Free to borrow</dt>
                <dd className="num mt-0.5">{usd(m.availableUsd)}</dd>
              </div>
              <div>
                <dt className="label">Supplied</dt>
                <dd className="num mt-0.5">{usd(m.supplyUsd)}</dd>
              </div>
              <div>
                <dt className="label">Used</dt>
                <dd className="mt-1">
                  <UsedBar u={m.utilization} />
                </dd>
              </div>
            </dl>
            <div className="mt-4">
              <RiskNotes notes={marketNotes(m, now)} />
            </div>
          </li>
        ))}
      </ol>
      <TablePager {...paged} anchorId="markets" unit="markets" />
    </div>
  )
}

// Opens the borrow / repay dialog. A market with a stop flag still opens (to repay and take collateral back).
function LoanButton({ market, now, symbol, onOpen }: { market: Market; now: number; symbol: string; onOpen: (m: Market) => void }) {
  const stop = marketNotes(market, now).some((n) => n.stop)
  return (
    <button
      type="button"
      onClick={() => onOpen(market)}
      className={`min-h-11 shrink-0 whitespace-nowrap border px-4 font-mono text-[15px] transition-colors ${stop ? 'border-line-2 text-muted hover:border-body' : 'border-accent text-accent hover:bg-accent hover:text-on-accent'}`}
    >
      {stop ? 'Repay only' : 'Borrow'}
      <span className="sr-only">
        {' '}
        against {symbol}, market {short(market.id)}
      </span>
    </button>
  )
}

// How much of the market is lent out. Near 100% means little is left to borrow and lenders may wait to withdraw.
function UsedBar({ u }: { u: number }) {
  const w = Math.max(0, Math.min(1, u))
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative h-[5px] w-16 overflow-hidden rounded-full bg-line" aria-hidden>
        <span className={`absolute inset-y-0 left-0 ${w >= 0.98 ? 'bg-antares' : 'bg-accent'}`} style={{ width: `${w * 100}%` }} />
      </span>
      <span className="num text-sm">{pct(w, 0)}</span>
    </span>
  )
}
