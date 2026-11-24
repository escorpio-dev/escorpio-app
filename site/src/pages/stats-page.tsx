import { useEffect, useState } from 'react'
import { PageHead } from '@/components/page-head'

// /stats: escorpio.pro traffic as Cloudflare counts it (functions/api/stats.ts, server/stats.ts). Only counted
// numbers, passed through unchanged; bots are included and the page says so. Read again every 10 minutes.
type Day = {
  date: string
  pageViews: number
  visitors: number
  requests: number
}
type Traffic = {
  since: string
  readAt: string
  days: Day[]
  totals: { pageViews: number; requests: number }
  today: Day | null
  yesterday: Day | null
  busiest: Day | null
}
type State = { kind: 'loading' } | { kind: 'off' } | { kind: 'error' } | { kind: 'ok'; t: Traffic }

const REFRESH_MS = 10 * 60_000
const n = (x: number) => x.toLocaleString('en-US')
const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function useTraffic(): State {
  const [state, setState] = useState<State>({ kind: 'loading' })
  useEffect(() => {
    let alive = true
    const read = async () => {
      try {
        const res = await fetch('/api/stats', {
          headers: { accept: 'application/json' },
        })
        if (!alive) return
        if (res.status === 503) return setState({ kind: 'off' })
        if (!res.ok) return setState((s) => (s.kind === 'ok' ? s : { kind: 'error' }))
        setState({ kind: 'ok', t: (await res.json()) as Traffic })
      } catch {
        if (alive) setState((s) => (s.kind === 'ok' ? s : { kind: 'error' }))
      }
    }
    void read()
    const timer = setInterval(() => document.visibilityState === 'visible' && read(), REFRESH_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])
  return state
}

// Counts up from the last shown value to the new one; with reduced motion it just shows the number.
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(() => (reduced() ? value : 0))
  useEffect(() => {
    if (reduced()) return setShown(value)
    const from = shown
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900)
      setShown(Math.round(from + (value - from) * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return <>{n(shown)}</>
}

export function StatsPage() {
  const state = useTraffic()
  return (
    <main className="wrap pb-28 pt-[130px] lg:pt-[180px]">
      <PageHead kicker="Stats" title="Who reads the desk">
        Traffic on escorpio.pro since it went live on 22 November, as Cloudflare counts it at the edge. The site has no cookies and no
        tracking script. Bots and crawlers are counted too, and every number below says what it counts.
      </PageHead>
      <div className="mt-14">
        {state.kind === 'ok' ? (
          <Traffic t={state.t} />
        ) : (
          <p className="k-stats-empty">
            {state.kind === 'loading'
              ? 'Reading Cloudflare…'
              : state.kind === 'off'
                ? 'Traffic numbers are not connected yet.'
                : 'Cloudflare did not answer just now. The page tries again in a few minutes.'}
          </p>
        )}
      </div>
    </main>
  )
}

function Traffic({ t }: { t: Traffic }) {
  return (
    <>
      <div className="k-stats-tiles">
        <Tile label={`Page views since ${day(t.since)}`} value={t.totals.pageViews} note="HTML page loads, people and bots" />
        <Tile label="Visitors today" value={t.today?.visitors ?? 0} note="unique IPs so far today (UTC), still counting" live />
        <Tile label="Visitors yesterday" value={t.yesterday?.visitors ?? 0} note="unique IPs, full UTC day" />
        <Tile
          label="Busiest day"
          value={t.busiest?.pageViews ?? 0}
          note={t.busiest ? `page views on ${day(t.busiest.date)}` : 'no full day yet'}
        />
      </div>
      <Chart days={t.days} />
      <details className="k-stats-table">
        <summary>Every day as a table</summary>
        <div className="k-stats-table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Day (UTC)</th>
                <th scope="col">Page views</th>
                <th scope="col">Visitors</th>
                <th scope="col">Requests</th>
              </tr>
            </thead>
            <tbody>
              {[...t.days].reverse().map((d) => (
                <tr key={d.date}>
                  <th scope="row">
                    {day(d.date)}
                    {d.date === t.today?.date ? ' (today)' : ''}
                  </th>
                  <td>{n(d.pageViews)}</td>
                  <td>{n(d.visitors)}</td>
                  <td>{n(d.requests)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <div className="k-stats-notes">
        <p>
          <span className="live-dot" aria-hidden /> Read {clock(t.readAt)}, from Cloudflare's zone analytics. Read again every 10 minutes.{' '}
          {n(t.totals.requests)} requests in all since {day(t.since)}, pictures, scripts and API calls included.
        </p>
        <p>
          Visitors are unique IP addresses per day, so the same person on two days counts twice and people behind one network count once;
          they are not added up across days. The same numbers as JSON:{' '}
          <a href="/api/stats" className="accent-link">
            /api/stats
          </a>
          .
        </p>
      </div>
    </>
  )
}

function Tile({ label, value, note, live }: { label: string; value: number; note: string; live?: boolean }) {
  return (
    <div className="k-stats-tile">
      <span className="k-stats-label">
        {live && <i aria-hidden className="live-dot" />}
        {label}
      </span>
      <strong>
        <CountUp value={value} />
      </strong>
      <span className="k-stats-note">{note}</span>
    </div>
  )
}

// Page views per UTC day. One series, so no legend: the title names it. Direct labels only on the busiest day and today.
function Chart({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<string | null>(null)
  const max = Math.max(1, ...days.map((d) => d.pageViews))
  const today = new Date().toISOString().slice(0, 10)
  const peak = days.reduce<Day | undefined>((b, d) => (!b || d.pageViews > b.pageViews ? d : b), undefined)
  return (
    <figure className="k-stats-chart">
      <figcaption>Page views per day</figcaption>
      <div className="k-bars" onMouseLeave={() => setHover(null)}>
        <span className="k-bars-max" aria-hidden>
          {n(max)}
        </span>
        {days.map((d, i) => {
          const open = hover === d.date
          const isToday = d.date === today
          return (
            <button
              type="button"
              key={d.date}
              className={`k-bar${isToday ? ' today' : ''}${open ? ' on' : ''}`}
              onMouseEnter={() => setHover(d.date)}
              onFocus={() => setHover(d.date)}
              onBlur={() => setHover(null)}
              aria-label={`${day(d.date)}${isToday ? ', today so far' : ''}: ${n(d.pageViews)} page views, ${n(d.visitors)} visitors, ${n(d.requests)} requests`}
            >
              <span
                className="k-bar-fill"
                style={{
                  height: `${Math.max(1.5, (d.pageViews / max) * 100)}%`,
                }}
              >
                {(d === peak || isToday) && <span className="k-bar-value">{n(d.pageViews)}</span>}
              </span>
              <span className="k-bar-day">{isToday ? 'Today' : day(d.date)}</span>
              {open && (
                <span className={`k-bar-tip${i >= days.length / 2 ? ' right' : ''}`} role="tooltip">
                  <b>
                    {day(d.date)}
                    {isToday ? ' · still counting' : ''}
                  </b>
                  <span>{n(d.pageViews)} page views</span>
                  <span>{n(d.visitors)} visitors</span>
                  <span>{n(d.requests)} requests</span>
                </span>
              )}
            </button>
          )
        })}
      </div>
    </figure>
  )
}
