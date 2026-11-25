// PROTOTYPE, throw away. Four structurally different home heroes, switchable with ?variant= (current, A, B, C, D) and the
// floating bar at the bottom (dev server only). Question: how can the copy read clearly while the scorpion video still
// looks good and the left side is not empty? Plan: "Four hero variants on the existing / route, switchable via ?variant=".
import { useState } from 'react'
import { Link } from 'react-router'
import { ArrowSvg } from '@/components/arrow-svg'
import { headlineVaults } from '@/data/desk'
import { pct, usd } from '@/lib/format'
import { useDesk } from '@/lib/use-desk'
import './home-hero.prototype.css'

export const HERO_VARIANTS = ['current', 'A', 'B', 'C', 'D'] as const
export const HERO_NAMES: Record<string, string> = {
  current: 'Current (PR #24)',
  A: 'Banner: soft fade, live numbers',
  B: 'Stage: video on top, copy below',
  C: 'Panel: solid card over sharp video',
  D: 'Split: copy left, framed video right',
}

const stillOnly = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function Media({ className }: { className?: string }) {
  const [still] = useState(stillOnly)
  return still ? (
    <img className={className} src="/media/hero.webp" alt="" aria-hidden />
  ) : (
    <video className={className} poster="/media/hero.webp" src="/media/hero.mp4" muted loop autoPlay playsInline preload="auto" aria-hidden />
  )
}

function Kicker() {
  return <p className="hp-kicker">Compare · then earn or borrow</p>
}
function Title({ className = '' }: { className?: string }) {
  return (
    <h1 className={`hp-title ${className}`}>
      The USDG desk
      <br />
      <span className="hp-lime">for Robinhood Chain</span>
    </h1>
  )
}
function Lede() {
  return <p className="hp-lede">Compare every vault and loan rate, see what each one hides, then earn or borrow right here from your own wallet.</p>
}
function Buttons() {
  return (
    <div className="hp-cta">
      <Link to="/earn" className="button">
        <ArrowSvg />
        Compare vault rates
      </Link>
      <Link to="/borrow" className="hp-ghost">
        Compare loan rates
      </Link>
    </div>
  )
}
function Trust() {
  return <p className="hp-trust">Live from Morpho · Escorpio never holds your money · Every risk flagged · Works with AI agents</p>
}

function useNumbers() {
  const { desk } = useDesk()
  if (!desk) return null
  const total = desk.vaults.reduce((s, v) => s + v.totalUsd, 0)
  const best = headlineVaults(desk)[0]
  return { markets: desk.markets.length, vaults: desk.vaults.length, total: usd(total), best: best ? pct(best.netApy) : '–', bestName: best?.name }
}

// A: like the X header. Video on the right, faded into the black with a mask (no overlay block); live numbers fill the left.
function VariantA() {
  const n = useNumbers()
  return (
    <section className="hp-a">
      <div className="hp-a-media">
        <Media />
      </div>
      <div className="width hp-a-inner">
        <div className="hp-a-copy">
          <Kicker />
          <Title />
          <Lede />
          <Buttons />
          <dl className="hp-a-stats">
            <div>
              <dt>Loan markets</dt>
              <dd>{n ? n.markets : '…'}</dd>
            </div>
            <div>
              <dt>Vaults</dt>
              <dd>{n ? n.vaults : '…'}</dd>
            </div>
            <div>
              <dt>USDG in vaults</dt>
              <dd>{n ? n.total : '…'}</dd>
            </div>
          </dl>
          <Trust />
        </div>
      </div>
    </section>
  )
}

// B: the video gets the stage, sharp and untouched; the copy sits below it on black in two columns.
function VariantB() {
  return (
    <section className="hp-b">
      <div className="hp-b-media">
        <Media />
      </div>
      <div className="width hp-b-grid">
        <div>
          <Kicker />
          <Title />
        </div>
        <div>
          <Lede />
          <Buttons />
          <Trust />
        </div>
      </div>
    </section>
  )
}

// C: sharp full-bleed video; the copy is a solid black card on the left, so nothing behind the text.
function VariantC() {
  return (
    <section className="hp-c">
      <div className="hp-c-media">
        <Media />
      </div>
      <div className="width hp-c-inner">
        <div className="hp-c-card">
          <Kicker />
          <Title />
          <Lede />
          <Buttons />
          <Trust />
        </div>
      </div>
    </section>
  )
}

// D: a hard split. Copy on the left half; the video framed on the right with a live rate chip on it.
function VariantD() {
  const n = useNumbers()
  return (
    <section className="hp-d">
      <div className="width hp-d-grid">
        <div className="hp-d-copy">
          <Kicker />
          <Title />
          <Lede />
          <Buttons />
          <Trust />
        </div>
        <div className="hp-d-frame">
          <Media />
          <div className="hp-d-chip">
            <span>Best open vault now</span>
            <b>{n ? n.best : '…'}</b>
            <small>{n?.bestName ?? 'reading Morpho…'}</small>
          </div>
        </div>
      </div>
    </section>
  )
}

export function HeroPrototype({ variant, current }: { variant: string; current: React.ReactNode }) {
  if (variant === 'A') return <VariantA />
  if (variant === 'B') return <VariantB />
  if (variant === 'C') return <VariantC />
  if (variant === 'D') return <VariantD />
  return <>{current}</>
}
