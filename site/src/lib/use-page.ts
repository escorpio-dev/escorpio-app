import { useState } from 'react'

// Client-side pages for a list that is already sorted. Goes back to page 1 when `resetKey` changes (new sort, filter
// or collateral), so a short list is never shown on an empty page 4.
export function usePage<T>(rows: T[], size: number, resetKey: string) {
  const [state, setState] = useState({ page: 0, key: resetKey })
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const page = Math.min(state.key === resetKey ? state.page : 0, pages - 1)
  const start = page * size
  return {
    page,
    pages,
    total: rows.length,
    from: rows.length ? start + 1 : 0,
    to: Math.min(rows.length, start + size),
    rows: rows.slice(start, start + size),
    go: (n: number) => setState({ page: n, key: resetKey }),
  }
}
