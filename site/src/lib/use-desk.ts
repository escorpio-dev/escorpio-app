import { useSyncExternalStore } from 'react'
import { fetchDesk, type Desk } from '@/data/morpho'

// One reading of the Morpho API shared by every page (a tiny module store, no provider). Re-read every 60 s while the
// tab is visible, so numbers on screen are never older than a minute plus the API's own delay. A failed re-read
// keeps the last good reading and says so.
const EVERY = 60_000
export const STALE_AFTER = 10 * 60_000

type DeskState = { desk: Desk | null; error: string | null; loading: boolean }

let state: DeskState = { desk: null, error: null, loading: true }
const listeners = new Set<() => void>()
let inFlight: AbortController | null = null
let timer: ReturnType<typeof setInterval> | undefined

const set = (patch: Partial<DeskState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export function refreshDesk() {
  inFlight?.abort()
  const ac = new AbortController()
  inFlight = ac
  set({ loading: true })
  fetchDesk(ac.signal)
    .then((desk) => set({ desk, error: null, loading: false }))
    .catch((e: unknown) => {
      if (ac.signal.aborted) return
      set({ error: e instanceof Error ? e.message : 'Could not read the Morpho API', loading: false })
    })
}

const onVisible = () => {
  if (document.visibilityState === 'visible' && state.desk && Date.now() - state.desk.readAt > EVERY) refreshDesk()
}

function subscribe(l: () => void) {
  listeners.add(l)
  if (listeners.size === 1) {
    if (!state.desk) refreshDesk()
    timer = setInterval(() => document.visibilityState === 'visible' && refreshDesk(), EVERY)
    document.addEventListener('visibilitychange', onVisible)
  }
  return () => {
    listeners.delete(l)
    if (!listeners.size) {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }
}

export const useDesk = () => useSyncExternalStore(subscribe, () => state)

// Wall clock for "read 12s ago" labels, one shared 1 s tick.
let now = Date.now()
const clockListeners = new Set<() => void>()
let clockTimer: ReturnType<typeof setInterval> | undefined
function subscribeClock(l: () => void) {
  clockListeners.add(l)
  if (clockListeners.size === 1)
    clockTimer = setInterval(() => {
      now = Date.now()
      clockListeners.forEach((x) => x())
    }, 1000)
  return () => {
    clockListeners.delete(l)
    if (!clockListeners.size) clearInterval(clockTimer)
  }
}
export const useNow = () => useSyncExternalStore(subscribeClock, () => now)
