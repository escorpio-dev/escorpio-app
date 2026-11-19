// Small divider: a square and two dots, with a rule to the right (left variant) or on both sides (center).
export function DotsDivider({ center = false, className = '' }: { center?: boolean; className?: string }) {
  const dots = (
    <span className="flex shrink-0 items-center gap-[5px]" aria-hidden>
      <span className="h-[7px] w-[7px] bg-muted" />
      <span className="h-[7px] w-[7px] rounded-full bg-muted" />
      <span className="h-[7px] w-[7px] rounded-full bg-muted" />
    </span>
  )
  return (
    <div className={`flex items-center gap-2 ${center ? 'justify-center' : ''} ${className}`} aria-hidden>
      {center && <span className="h-px w-[120px] bg-line-2" />}
      {dots}
      <span className="h-px w-[120px] bg-line-2 sm:w-[150px]" />
    </div>
  )
}
