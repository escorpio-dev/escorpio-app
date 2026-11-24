import type { Market } from '@/data/morpho'
import { pct, usd } from '@/lib/format'

// Every market for one collateral on a slider-like rate line: further right = dearer to borrow. The track fills lime up
// to the picked market, which is the handle with its rate in a bubble above; other markets are small dots, the cheapest
// one lime. Rates above the scale end sit at the right edge, "off scale". Markets close together can also be picked
// from the list below.
const CAP = 0.6

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
  const x = (m: Market) => (Math.min(m.borrowApy, end) / end) * 100
  // Draw the picked one last so its handle sits on top.
  const sorted = [...markets].sort((a, b) => (a.id === selectedId ? 1 : b.id === selectedId ? -1 : a.borrowApy - b.borrowApy))
  const picked = markets.find((m) => m.id === selectedId)
  const px = picked ? x(picked) : 0
  // Keep the bubble inside the line at both ends.
  const shift = px < 6 ? '0%' : px > 94 ? '-100%' : '-50%'
  const off = markets.some((m) => m.borrowApy > end)

  return (
    <div className="relative select-none">
      <div className="relative h-[84px]">
        <div className="k-axis-track" aria-hidden />
        {picked && <div className="k-axis-fill" style={{ width: `${px}%` }} aria-hidden />}
        {picked && (
          <div className="k-axis-bubble" style={{ left: `${px}%`, translate: `${shift} 0` }} aria-hidden>
            {pct(picked.borrowApy)}
          </div>
        )}
        {ticks.map((t) => (
          <div key={t} className="absolute bottom-0 -translate-x-1/2" style={{ left: `${(t / end) * 100}%` }} aria-hidden>
            <div className="num text-[11px] text-muted">{Math.round(t * 100)}%</div>
          </div>
        ))}
        {sorted.map((m) => {
          const sel = m.id === selectedId
          const low = m.id === lowId
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              aria-pressed={sel}
              aria-label={`${pct(m.borrowApy)} a year, ${usd(m.availableUsd)} free to borrow, liquidation at ${(m.lltv * 100).toFixed(1)}% LTV${m.borrowApy > end ? ', off scale' : ''}${low ? ', cheapest' : ''}`}
              className="k-axis-hit"
              style={{ left: `${x(m)}%` }}
            >
              <span className={sel ? 'k-axis-handle' : low ? 'k-axis-dot low' : 'k-axis-dot'} />
            </button>
          )
        })}
      </div>
      {off && <div className="label mt-1 text-right">At the right edge: rate above {Math.round(end * 100)}%, off scale</div>}
    </div>
  )
}
