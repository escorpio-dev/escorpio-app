import { useEffect } from 'react'
import { useSearchParams } from 'react-router'

// PROTOTYPE tool, throw away with the prototypes that use it. A floating bar that cycles ?variant= with arrows or the
// arrow keys. Renders nothing in production builds (import.meta.env.DEV is false there).
export function PrototypeSwitcher({ variants, names }: { variants: readonly string[]; names: Record<string, string> }) {
  const [params, setParams] = useSearchParams()
  const current = params.get('variant') ?? variants[0]
  const i = Math.max(0, variants.indexOf(current))
  const go = (d: number) => {
    const next = variants[(i + d + variants.length) % variants.length]
    const p = new URLSearchParams(params)
    p.set('variant', next)
    setParams(p, { replace: true })
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.closest('input, textarea, select') || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (!import.meta.env.DEV) return null
  return (
    <div
      role="toolbar"
      aria-label="Prototype variants"
      style={{
        position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', alignItems: 'center',
        gap: 10, padding: '8px 10px', background: '#fff', color: '#111', borderRadius: 999, boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
        fontFamily: 'system-ui, sans-serif', fontSize: 14, whiteSpace: 'nowrap',
      }}
    >
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant" style={{ border: 0, background: '#eee', borderRadius: 999, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>
        ←
      </button>
      <span style={{ minWidth: 220, textAlign: 'center' }}>
        <b>{current}</b> · {names[current] ?? ''}
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant" style={{ border: 0, background: '#eee', borderRadius: 999, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>
        →
      </button>
    </div>
  )
}
