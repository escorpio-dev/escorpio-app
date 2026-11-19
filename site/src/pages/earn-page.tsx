import { lazy, Suspense, useMemo, useState } from 'react'
import { DeskReadout } from '@/components/desk-readout'
import { PageHead } from '@/components/page-head'
import { RiskNotes } from '@/components/risk-notes'
import { StatStrip } from '@/components/stat-strip'
import { TablePager } from '@/components/table-pager'
import { headlineVaults, vaultNotes } from '@/data/desk'
import type { Vault } from '@/data/morpho'
import { age, pct, usd } from '@/lib/format'
import { useDesk } from '@/lib/use-desk'
import { usePage } from '@/lib/use-page'

type Sort = 'rate' | 'size' | 'withdrawable'
const SORTS: [Sort, string][] = [
  ['rate', 'Net rate'],
  ['size', 'Size'],
  ['withdrawable', 'Withdrawable'],
]
const PAGE = 10
// The wallet code (viem) loads only when someone opens a vault, so the rest of the site stays light.
const VaultDialog = lazy(() => import('@/components/vault-dialog').then((m) => ({ default: m.VaultDialog })))
// Shown by default: at least $1k inside and no reason to stay away today.
const isOpen = (v: Vault, now: number) => v.totalUsd >= 1_000 && !vaultNotes(v, now).some((n) => n.stop)

export function EarnPage() {
  const { desk, error } = useDesk()
  const [sort, setSort] = useState<Sort>('rate')
  const [all, setAll] = useState(false)
  const [pick, setPick] = useState<Vault>()

  const rows = useMemo(() => {
    if (!desk) return []
    const list = desk.vaults.filter((v) => all || isOpen(v, desk.readAt))
    const key: Record<Sort, (v: Vault) => number> = { rate: (v) => v.netApy, size: (v) => v.totalUsd, withdrawable: (v) => v.withdrawableUsd }
    return [...list].sort((a, b) => key[sort](b) - key[sort](a))
  }, [desk, sort, all])
  const paged = usePage(rows, PAGE, `${sort}-${all}`)
  const hidden = desk ? desk.vaults.length - rows.length : 0
  const best = desk ? headlineVaults(desk)[0] : undefined
  const open = desk ? desk.vaults.filter((v) => isOpen(v, desk.readAt)) : []

  return (
    <main className="wrap pb-28 pt-[130px] lg:pt-[180px]">
      <PageHead
        kicker="Earn"
        title="Where USDG earns on Robinhood Chain"
        bg="bg-earn"
      >
        Every Morpho vault that holds real USDG (matched by contract address, not by name). The net rate is after the vault's
        own fees. "Withdrawable" is what could leave the vault right now: a vault can show a good rate and still have nothing
        you can take out today.
      </PageHead>

      {desk && (
        <StatStrip
          stats={[
            { k: 'Best open rate', v: best ? pct(best.netApy) : 'no data yet', sub: best?.name },
            { k: 'USDG in vaults', v: usd(desk.vaults.reduce((s, v) => s + v.totalUsd, 0)), sub: `${desk.vaults.length} vaults read` },
            { k: 'Open vaults', v: String(open.length), sub: `${desk.vaults.length - open.length} closed, stuck or tiny` },
            { k: 'Withdrawable now', v: usd(open.reduce((s, v) => s + v.withdrawableUsd, 0)), sub: 'across the open vaults' },
          ]}
        />
      )}

      <div id="vaults" className="mt-16 scroll-mt-28 flex flex-wrap items-center justify-between gap-4 border-b border-line-2 pb-4">
        <div role="group" aria-label="Sort by" className="flex items-center gap-1.5">
          <span className="label mr-2">Sort</span>
          {SORTS.map(([k, name]) => (
            <button
              key={k}
              type="button"
              aria-pressed={sort === k}
              onClick={() => setSort(k)}
              className={`min-h-11 border px-4 font-mono text-[15px] transition-colors ${sort === k ? 'border-accent bg-accent text-on-accent' : 'border-line-2 text-ink hover:border-accent'}`}
            >
              {name}
            </button>
          ))}
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 font-mono text-[15px] text-body">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4 accent-[#bdff00]" />
          Show closed and tiny vaults too
        </label>
      </div>

      {!desk && <p className="py-16 text-center text-muted">{error ? 'No data yet: the Morpho API did not answer.' : 'Reading the Morpho API…'}</p>}

      {desk && (
        <>
          {/* Desktop table */}
          <table className="hidden w-full text-left text-[16px] lg:table">
            <caption className="sr-only">USDG vaults on Robinhood Chain</caption>
            <thead>
              <tr className="border-b border-line">
                {['#', 'Vault', 'Net rate', 'Inside', 'Withdrawable now', 'What to know', ''].map((h, i) => (
                  <th key={h + i} scope="col" className={`label whitespace-nowrap py-4 font-normal ${i > 1 && i < 5 ? 'pl-6 text-right' : ''} ${i === 5 ? 'pl-10' : ''}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.rows.map((v, i) => (
                <tr key={v.address} className="border-b border-line align-top transition-colors hover:bg-card">
                  <td className="num py-5 pr-4 font-mono text-muted">{String(paged.from + i).padStart(2, '0')}</td>
                  <td className="py-5 pr-4">
                    <div className="text-[18px] font-bold text-ink">{v.name || 'Unnamed vault'}</div>
                    <div className="mt-1 text-[14px] text-muted">{v.curators.length ? v.curators.join(', ') : 'No named curator'}</div>
                    <div className="num mt-1 text-[14px] text-muted">
                      {ageText(age(v.createdAt, desk.readAt))} · fees {fees(v).toLowerCase()}
                    </div>
                  </td>
                  <td className={`num whitespace-nowrap py-5 pl-6 text-right text-[24px] leading-none ${v.address === best?.address ? 'text-accent' : 'text-ink'}`}>{pct(v.netApy)}</td>
                  <td className="num whitespace-nowrap py-5 pl-6 text-right text-ink">{usd(v.totalUsd)}</td>
                  <td className="num whitespace-nowrap py-5 pl-6 text-right text-ink">{usd(v.withdrawableUsd)}</td>
                  <td className="w-[300px] py-5 pl-10">
                    <RiskNotes notes={vaultNotes(v, desk.readAt)} />
                  </td>
                  <td className="whitespace-nowrap py-5 pl-6 text-right">
                    <DepositButton vault={v} now={desk.readAt} onPick={setPick} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Phones and tablets: one ledger entry per vault */}
          <ol className="lg:hidden">
            {paged.rows.map((v) => (
              <li key={v.address} className="border-b border-line py-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[18px] font-bold text-ink">{v.name || 'Unnamed vault'}</div>
                    <div className="mt-1 text-[14px] text-muted">{v.curators.length ? v.curators.join(', ') : 'No named curator'}</div>
                  </div>
                  <div className={`num shrink-0 text-[28px] leading-none ${v.address === best?.address ? 'text-accent' : 'text-ink'}`}>{pct(v.netApy)}</div>
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-[15px] sm:grid-cols-4">
                  <Cell k="Inside" v={usd(v.totalUsd)} />
                  <Cell k="Withdrawable" v={usd(v.withdrawableUsd)} />
                  <Cell k="Age" v={age(v.createdAt, desk.readAt)} />
                  <Cell k="Fees" v={fees(v)} />
                </dl>
                <div className="mt-5 flex items-end justify-between gap-4">
                  <RiskNotes notes={vaultNotes(v, desk.readAt)} />
                  <DepositButton vault={v} now={desk.readAt} onPick={setPick} />
                </div>
              </li>
            ))}
          </ol>

          {!rows.length && <p className="py-12 text-center text-muted">No vault passes the filter right now.</p>}
          <TablePager {...paged} anchorId="vaults" unit="vaults" />
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
            <DeskReadout />
            {hidden > 0 && !all && (
              <button type="button" onClick={() => setAll(true)} className="accent-link font-mono text-[15px]">
                {hidden} closed, stuck or tiny vaults hidden. Show them
              </button>
            )}
          </div>
        </>
      )}

      <ReadGuide />
      {pick && desk && (
        <Suspense fallback={null}>
          <VaultDialog vault={pick} readAt={desk.readAt} onClose={() => setPick(undefined)} />
        </Suspense>
      )}
    </main>
  )
}

// Three short definitions under the table, so the columns mean the same thing to everyone.
function ReadGuide() {
  const items = [
    ['Net rate', 'The yearly rate the vault pays right now after its own fees, as Morpho reports it. It changes as borrowers come and go, so it is not a promise.'],
    ['Withdrawable now', 'USDG you could take out of the vault right now. When most of it is lent out, withdrawals wait until borrowers repay.'],
    ['What to know', 'Filled squares are reasons not to deposit today (closed, stuck, price feed down). Empty squares are worth reading first.'],
  ]
  return (
    <section aria-labelledby="read-guide" className="mt-24">
      <h2 id="read-guide" className="h-cond !text-[clamp(2rem,4vw,3rem)]">
        How to read the table
      </h2>
      <div className="mt-8 grid gap-8 border-t border-line-2 pt-8 md:grid-cols-3">
        {items.map(([k, d]) => (
          <div key={k}>
            <h3 className="h-small">{k}</h3>
            <p className="mt-3 text-[16px] leading-[1.6]">{d}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

const ageText = (a: string) => (a === 'today' ? 'made today' : a === 'n/a' ? 'age unknown' : `${a} old`)

const fees = (v: Vault) => {
  const parts = []
  if (v.performanceFee) parts.push(`${pct(v.performanceFee, 0)} of yield`)
  if (v.managementFee) parts.push(`${pct(v.managementFee, 2)}/yr`)
  return parts.length ? parts.join(' + ') : 'None'
}

// Opens the deposit / withdraw dialog. A vault with a stop flag still opens (to withdraw), but says why it is shut.
function DepositButton({ vault, now, onPick }: { vault: Vault; now: number; onPick: (v: Vault) => void }) {
  const stop = vaultNotes(vault, now).some((n) => n.stop)
  return (
    <button
      type="button"
      onClick={() => onPick(vault)}
      className={`min-h-11 shrink-0 whitespace-nowrap border px-4 font-mono text-[15px] transition-colors ${stop ? 'border-line-2 text-muted hover:border-body' : 'border-accent text-accent hover:bg-accent hover:text-on-accent'}`}
    >
      {stop ? 'Withdraw only' : 'Deposit'}
      <span className="sr-only"> {vault.name || 'Unnamed vault'}</span>
    </button>
  )
}

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="label">{k}</dt>
      <dd className="num mt-1 text-ink">{v}</dd>
    </div>
  )
}
