import type { Market } from '@/data/morpho'
import { pct, usd } from '@/lib/format'

// Every market for one collateral as a star on a single rate line: further right = dearer to borrow, bigger dot =
// more money supplied. Rates above the scale end sit at the right edge, marked "off scale".
const CAP = 0.6
const LANE = 15

export function RateAxis({
  markets,
  lowId,
  selectedId,
  onSelect,
}: {
  markets: Market[]
  lowId?: string
  selectedId?: string
  onSelect: (id: string) => void
}) {
  const shown = Math.min(CAP, Math.max(0.05, ...markets.map((m) => m.borrowApy)))
  const step = shown > 0.3 ? 0.1 : 0.05
  const end = Math.ceil(shown / step - 1e-9) * step
  const ticks = Array.from({ length: Math.round(end / step) + 1 }, (_, i) => i * step)
  const maxSupply = Math.max(1, ...markets.map((m) => m.supplyUsd))

  // Stack dots that would overlap into lanes above the line.
  const sorted = [...markets].sort((a, b) => a.borrowApy - b.borrowApy)
  const lastInLane: number[] = []
  const dots = sorted.map((m) => {
    const x = (Math.min(m.borrowApy, end) / end) * 100
    const d = 9 + 24 * Math.sqrt(m.supplyUsd / maxSupply)
    let lane = 0
    while (lane < 4 && lastInLane[lane] !== undefined && x - lastInLane[lane] < 3.2) lane++
    lastInLane[Math.min(lane, 4)] = x
    return { m, x, d, lane: Math.min(lane, 4), off: m.borrowApy > end }
  })

  return (
    <div className="relative select-none">
      <div className="relative h-[124px]">
        <div className="absolute inset-x-0 bottom-[30px] h-px bg-line-2" aria-hidden />
        {ticks.map((t) => (
          <div key={t} className="absolute bottom-0 -translate-x-1/2" style={{ left: `${(t / end) * 100}%` }} aria-hidden>
            <div className="mx-auto mb-1.5 h-[7px] w-px bg-line-2" />
            <div className="num text-[11px] text-muted">{Math.round(t * 100)}%</div>
          </div>
        ))}
        {dots.map(({ m, x, d, lane, off }) => {
          const sel = m.id === selectedId
          const low = m.id === lowId
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              aria-pressed={sel}
              aria-label={`${pct(m.borrowApy)} a year, ${usd(m.availableUsd)} free to borrow, liquidation at ${(m.lltv * 100).toFixed(1)}% LTV${off ? ', off scale' : ''}`}
              className="absolute -translate-x-1/2 translate-y-1/2 rounded-full p-1"
              style={{ left: `${x}%`, bottom: 30 + lane * LANE }}
            >
              <span
                className={`block rounded-full transition-transform duration-200 hover:scale-110 ${low ? 'bg-accent' : 'bg-body/60'} ${sel ? 'ring-2 ring-white ring-offset-2 ring-offset-black' : ''}`}
                style={{ width: d, height: d }}
              />
            </button>
          )
        })}
      </div>
      {dots.some((x) => x.off) && <div className="label mt-1 text-right">Dots at the right edge: rate above {Math.round(end * 100)}%, off scale</div>}
    </div>
  )
}
