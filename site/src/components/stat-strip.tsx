// The page's key numbers in one row, read live: big condensed figure, a mono label above, one line of context below.
// The first figure is lime, like the best rate in the tables.
export type Stat = { k: string; v: string; sub?: string }

export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <dl className="mt-14 grid grid-cols-2 border-t border-line-2 lg:grid-cols-4">
      {stats.map((s, i) => (
        <div key={s.k} className={`border-b border-line py-6 pr-4 lg:border-b-0 ${i > 0 ? 'lg:border-l lg:pl-6' : ''} ${i % 2 ? 'border-l border-line pl-4 lg:pl-6' : ''}`}>
          <dt className="label">{s.k}</dt>
          <dd className={`h-cond num mt-3 !text-[clamp(2.2rem,4.4vw,3.4rem)] ${i === 0 ? '!text-accent' : ''}`}>{s.v}</dd>
          {s.sub && <dd className="mt-2 truncate font-mono text-[14px] text-body" title={s.sub}>{s.sub}</dd>}
        </div>
      ))}
    </dl>
  )
}
