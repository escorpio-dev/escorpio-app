import type { Note } from '@/data/desk'

// Plain-word risk notes, one per line. Stop notes (a reason not to use it right now) are red and come first.
export function RiskNotes({ notes, empty = 'No flags from Morpho or us' }: { notes: Note[]; empty?: string }) {
  if (!notes.length) return <span className="text-sm text-muted">{empty}</span>
  const sorted = [...notes].sort((a, b) => Number(b.stop) - Number(a.stop))
  return (
    <ul className="grid gap-0.5 text-sm leading-snug">
      {sorted.map((n) => (
        <li key={n.text} className={n.stop ? 'text-antares-ink' : 'text-body'}>
          <span aria-hidden className="mr-1.5 font-mono text-[0.8em]">{n.stop ? '■' : '□'}</span>
          {n.stop && <span className="sr-only">Stop: </span>}
          {n.text}
        </li>
      ))}
    </ul>
  )
}
