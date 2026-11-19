import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { pct } from '@/lib/format'

// One numbered product row (styles: .home-reserve-product in layout.css, needs a .home-wrap parent): a plate
// stack icon, the number and title, the rates in two columns, and a button. Hovering or focusing a rate fades in
// the coin note with that rate written on it. A struck-through entry has a stop note (closed, stuck...).
// A row for a job not built yet (soon) shows one sentence and a grey "Coming next" instead of rates and a link.
export type RateItem = { key: string; rate: number; name: string; to: string; no?: string }

export function RateRow({
  n,
  title,
  plates,
  items = [],
  cta,
  unit = '',
  soon,
}: {
  n: string
  title: string
  plates: number
  items?: RateItem[]
  cta?: { to: string; label: string }
  unit?: string
  soon?: string
}) {
  const [on, setOn] = useState<RateItem | undefined>()
  const cols: RateItem[][] = [items.slice(0, 4), items.slice(4)]
  const entry = (it: RateItem): ReactNode => (
    <div className={`product-config${it.no ? ' no' : ''}`} key={it.key}>
      <p>
        {pct(it.rate)}{' '}
        <Link
          to={it.to}
          className="k-item"
          onMouseEnter={() => setOn(it)}
          onMouseLeave={() => setOn(undefined)}
          onFocus={() => setOn(it)}
          onBlur={() => setOn(undefined)}
          title={it.no ? `${it.name}: ${it.no}` : it.name}
        >
          {it.name}
        </Link>
        {it.no && <span className="sr-only"> ({it.no})</span>}
      </p>
    </div>
  )
  return (
    <div className={`home-reserve-product${on ? ' has-note' : ''}`}>
      <div className="col title">
        <div className="icon">
          <img src={`/media/stack-${plates}.png`} alt="" width={85} />
        </div>
        <div className="text">
          <div className={`k-note${on ? ' on' : ''}`} aria-hidden>
            <img src="/media/note-coins.webp" alt="" width={300} height={174} />
            {on && (
              <span>
                <b>{pct(on.rate)}</b>
                <i>
                  {on.name} · {unit}
                </i>
              </span>
            )}
          </div>
          <span className="number">{n}.</span>
          <h3>{title}</h3>
        </div>
      </div>
      {soon ? (
        <div className="col paragraph">
          <p>{soon}</p>
        </div>
      ) : (
        cols.map((c, i) => (
          <div className="col config" key={i}>
            {c.map(entry)}
            {!items.length && i === 0 && <p>Reading Morpho…</p>}
          </div>
        ))
      )}
      <div className="col buy">
        {cta && !soon ? (
          <Link to={cta.to} className="button full">
            {cta.label}
          </Link>
        ) : (
          <span className="button full disabled">Coming next</span>
        )}
      </div>
    </div>
  )
}
