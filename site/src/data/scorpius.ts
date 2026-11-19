// Scorpius from real star positions (J2000 right ascension in hours, declination in degrees, visual magnitude).
// Shared with the Remotion asset project (logo, icons, chart backdrop).

export type Star = { id: string; name: string; greek: string; ra: number; dec: number; mag: number }

export const STARS: Star[] = [
  { id: 'nu', name: 'Jabbah', greek: 'ν', ra: 16.1999, dec: -19.4606, mag: 4.0 },
  { id: 'beta', name: 'Acrab', greek: 'β', ra: 16.0906, dec: -19.8054, mag: 2.62 },
  { id: 'delta', name: 'Dschubba', greek: 'δ', ra: 16.0056, dec: -22.6217, mag: 2.29 },
  { id: 'pi', name: 'Fang', greek: 'π', ra: 15.9809, dec: -26.1141, mag: 2.89 },
  { id: 'rho', name: 'Rho', greek: 'ρ', ra: 15.9481, dec: -29.2141, mag: 3.87 },
  { id: 'sigma', name: 'Alniyat', greek: 'σ', ra: 16.3531, dec: -25.5928, mag: 2.88 },
  { id: 'alpha', name: 'Antares', greek: 'α', ra: 16.4901, dec: -26.432, mag: 1.06 },
  { id: 'tau', name: 'Paikauhale', greek: 'τ', ra: 16.5981, dec: -28.2161, mag: 2.82 },
  { id: 'epsilon', name: 'Larawag', greek: 'ε', ra: 16.8361, dec: -34.2933, mag: 2.29 },
  { id: 'mu', name: 'Xamidimura', greek: 'μ', ra: 16.8645, dec: -38.0475, mag: 3.08 },
  { id: 'zeta', name: 'Zeta', greek: 'ζ', ra: 16.9097, dec: -42.3614, mag: 3.62 },
  { id: 'eta', name: 'Eta', greek: 'η', ra: 17.2026, dec: -43.2392, mag: 3.33 },
  { id: 'theta', name: 'Sargas', greek: 'θ', ra: 17.622, dec: -42.9978, mag: 1.86 },
  { id: 'iota', name: 'Iota', greek: 'ι', ra: 17.7931, dec: -40.1269, mag: 3.03 },
  { id: 'kappa', name: 'Girtab', greek: 'κ', ra: 17.7081, dec: -39.03, mag: 2.39 },
  { id: 'lambda', name: 'Shaula', greek: 'λ', ra: 17.5601, dec: -37.1038, mag: 1.62 },
  { id: 'upsilon', name: 'Lesath', greek: 'υ', ra: 17.5127, dec: -37.2958, mag: 2.7 },
]

// The usual stick figure: claws, body through Antares, tail curling down to the stinger (Shaula and Lesath).
export const LINES: [string, string][] = [
  ['nu', 'beta'],
  ['beta', 'delta'],
  ['delta', 'pi'],
  ['pi', 'rho'],
  ['delta', 'sigma'],
  ['sigma', 'alpha'],
  ['alpha', 'tau'],
  ['tau', 'epsilon'],
  ['epsilon', 'mu'],
  ['mu', 'zeta'],
  ['zeta', 'eta'],
  ['eta', 'theta'],
  ['theta', 'iota'],
  ['iota', 'kappa'],
  ['kappa', 'lambda'],
  ['lambda', 'upsilon'],
]

// Gnomonic-free flat projection, fine for a 24 degree patch: east (higher RA) is drawn to the left, as on a sky chart
// with north up. Centre and scale are fixed so the chart grid and the stars use the same numbers everywhere.
export const CENTER = { ra: 16.87, dec: -31.35 }
const COS = Math.cos((CENTER.dec * Math.PI) / 180)

/** Sky position to a point in a size x size square (degrees across = span). */
export function project(ra: number, dec: number, size: number, span = 30) {
  const k = size / span
  return {
    x: size / 2 - (ra - CENTER.ra) * 15 * COS * k,
    y: size / 2 - (dec - CENTER.dec) * k,
  }
}

/** Dot radius from magnitude: brighter star, bigger dot. */
export const starRadius = (mag: number, unit: number) => unit * (1 + (4.2 - mag) * 0.62)

export const starById = Object.fromEntries(STARS.map((s) => [s.id, s])) as Record<string, Star>

/** Dot radius for one star; Antares is drawn a little larger as the chart's accent. */
export const dotRadius = (id: string, unit: number) => starRadius(starById[id].mag, unit) * (id === 'alpha' ? 1.35 : 1)

type Pt = { x: number; y: number }

/**
 * Constellation lines that stop short of each star (star chart style), so dots never melt into the strokes.
 * Lines whose ends would overlap are dropped. `skip` leaves stars out (the logo drops close neighbours).
 */
export function segments(pts: Record<string, Pt>, unit: number, gap: number, skip: string[] = []) {
  const out: { key: string; x1: number; y1: number; x2: number; y2: number }[] = []
  for (const [a, b] of LINES) {
    if (skip.includes(a) || skip.includes(b)) continue
    const p = pts[a]
    const q = pts[b]
    const len = Math.hypot(q.x - p.x, q.y - p.y)
    const ux = (q.x - p.x) / len
    const uy = (q.y - p.y) / len
    const ta = dotRadius(a, unit) + gap
    const tb = dotRadius(b, unit) + gap
    if (ta + tb >= len) continue
    out.push({ key: a + b, x1: p.x + ux * ta, y1: p.y + uy * ta, x2: q.x - ux * tb, y2: q.y - uy * tb })
  }
  return out
}
