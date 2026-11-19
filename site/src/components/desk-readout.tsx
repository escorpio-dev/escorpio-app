import { RotateCw } from 'lucide-react'
import { ago, clock } from '@/lib/format'
import { STALE_AFTER, refreshDesk, useDesk, useNow } from '@/lib/use-desk'

// The instrument line under every table: where the numbers came from and how old they are.
export function DeskReadout({ className = '' }: { className?: string }) {
  const { desk, error, loading } = useDesk()
  const now = useNow()
  const stale = desk && now - desk.readAt > STALE_AFTER

  let text: string
  if (desk) text = `Read ${clock(desk.readAt)} · ${ago(desk.readAt, now)} · Morpho API`
  else if (error) text = 'No data yet · the Morpho API did not answer'
  else text = 'Reading the Morpho API…'

  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${className}`} aria-live="polite">
      <span className="label flex items-center gap-2 !text-body">
        <span
          aria-hidden
          className={`inline-block h-[7px] w-[7px] rounded-full ${desk && !stale && !error ? 'live-dot bg-accent' : 'bg-muted'}`}
        />
        {text}
      </span>
      {(error || stale) && desk && (
        <span className="label !text-antares-ink">{error ? 'Last re-read failed, showing the reading above' : 'Older than 10 minutes'}</span>
      )}
      <button
        type="button"
        onClick={refreshDesk}
        disabled={loading}
        className="label flex min-h-9 items-center gap-1.5 px-1.5 !text-accent hover:!text-white disabled:opacity-50"
      >
        <RotateCw size={12} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden />
        Read again
      </button>
    </div>
  )
}
