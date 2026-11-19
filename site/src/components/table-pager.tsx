// Page numbers under a table: "1-10 of 40" on the left, square mono buttons on the right.
// Moving to another page scrolls back to the top of the table so the reader does not land mid-list.
export function TablePager({
  page,
  pages,
  from,
  to,
  total,
  go,
  anchorId,
  unit,
}: {
  page: number
  pages: number
  from: number
  to: number
  total: number
  go: (n: number) => void
  anchorId: string
  unit: string
}) {
  if (total === 0) return null
  const move = (n: number) => {
    go(n)
    document.getElementById(anchorId)?.scrollIntoView({ block: 'start' })
  }
  const box = 'num flex min-h-11 min-w-11 items-center justify-center border px-3 font-mono text-[15px] transition-colors'
  return (
    <nav aria-label={`${unit} pages`} className="mt-6 flex flex-wrap items-center justify-between gap-4">
      <p className="font-mono text-[15px] text-body">
        {from}-{to} of {total} {unit}
      </p>
      {pages > 1 && (
        <ul className="flex flex-wrap gap-1.5">
          <li>
            <button type="button" disabled={page === 0} onClick={() => move(page - 1)} className={`${box} border-line-2 text-ink hover:border-accent disabled:opacity-35 disabled:hover:border-line-2`}>
              Prev
            </button>
          </li>
          {Array.from({ length: pages }, (_, i) => (
            <li key={i}>
              <button
                type="button"
                aria-current={i === page ? 'page' : undefined}
                aria-label={`Page ${i + 1}`}
                onClick={() => move(i)}
                className={`${box} ${i === page ? 'border-accent bg-accent text-on-accent' : 'border-line-2 text-ink hover:border-accent'}`}
              >
                {i + 1}
              </button>
            </li>
          ))}
          <li>
            <button type="button" disabled={page === pages - 1} onClick={() => move(page + 1)} className={`${box} border-line-2 text-ink hover:border-accent disabled:opacity-35 disabled:hover:border-line-2`}>
              Next
            </button>
          </li>
        </ul>
      )}
    </nav>
  )
}
