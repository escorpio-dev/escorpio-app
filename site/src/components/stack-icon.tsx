// Line-art stack of plates for the desk rows: one plate per step number.
export function StackIcon({ layers }: { layers: number }) {
  const h = 14 + layers * 7
  return (
    <svg width="52" height={h + 6} viewBox={`0 0 52 ${h + 6}`} fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
      {Array.from({ length: layers }, (_, i) => {
        const y = h - i * 7
        return <path key={i} d={`M2 ${y - 6} L22 ${y - 13} L50 ${y - 7} L30 ${y} Z`} />
      })}
    </svg>
  )
}
