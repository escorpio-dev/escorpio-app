import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ArrowSvg } from '@/components/arrow-svg'
import { DeskReadout } from '@/components/desk-readout'
import { RateRow, type RateItem } from '@/components/rate-row'
import { cheapest, collaterals, headlineVaults, vaultNotes, yearly } from '@/data/desk'
import { pct, usd, usdg } from '@/lib/format'
import { useDesk } from '@/lib/use-desk'

// Home page (styles in layout.css): hero with the amount box, what Escorpio does, pictures, the rate rows with live
// Morpho numbers, and how it works.
export function HomePage() {
  return (
    <main className="home-wrap">
      <Top />
      <Intro />
      <What />
      <PhotoGrid />
      <Reserve />
      <How />
    </main>
  )
}

// The hero is a looping video (start frame = end frame); with reduced motion only the still shows.
const stillOnly = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// The hero holds the amount box. Typing shows a year
// at today's best open vault rate right here; the button scrolls down to the rate rows (#compare) on this page.
function Top() {
  const [still] = useState(stillOnly)
  const { desk } = useDesk()
  const [raw, setRaw] = useState('')
  const amount = Math.max(0, Math.min(1e12, Number(raw.replace(/,/g, '')) || 0))
  const best = desk ? headlineVaults(desk)[0] : undefined
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const target = document.getElementById('compare')
    if (!target) return
    target.scrollIntoView({ behavior: stillOnly() ? 'auto' : 'smooth' })
    target.focus({ preventScroll: true })
  }
  return (
    <div className="home-top">
      <div className="home-top-video">
        {still ? (
          <img src="/media/hero.webp" alt="" aria-hidden width={1920} height={1080} />
        ) : (
          <video className="hero-video" poster="/media/hero.webp" src="/media/hero.mp4" muted loop autoPlay playsInline preload="auto" aria-hidden />
        )}
      </div>
      <div className="width">
        <h1>
          Idle USDG,
          <br />
          put to work
        </h1>
        <p className="k-lede">How much USDG is sitting still? Type it in to see a year at today's best open vault rate. A snapshot, not a promise.</p>
        <form onSubmit={submit} className="k-amount">
          <div className="relative">
            <label htmlFor="idle" className="sr-only">
              Idle USDG
            </label>
            <input id="idle" inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="10,000 USDG" />
            <button type="submit" className="button">
              <ArrowSvg />
              Put it to work
            </button>
          </div>
          <p className="k-yield" aria-live="polite">
            {best && amount > 0 ? (
              <>
                A year in {best.name} at {pct(best.netApy)}: <strong>+{usdg(yearly(amount, best.netApy))} USDG</strong>, if the rate held.
              </>
            ) : (
              ' '
            )}
          </p>
        </form>
      </div>
    </div>
  )
}

function Intro() {
  return (
    <div className="home-intro">
      <div className="width">
        <p>
          <span className="k-accent">Escorpio</span> shows live rates for every USDG vault and loan on Robinhood Chain. You can
          park idle money, borrow against your stock tokens, or just compare. No sign-up, no custody, no made-up numbers.
        </p>
      </div>
    </div>
  )
}

function What() {
  return (
    <div className="home-what">
      <div className="width">
        <div className="home-what-top">
          <div className="fancy-divider">
            <div className="circle" />
            <div className="circle" />
          </div>
          <div className="image">
            <img src="/media/tile-feature.webp" alt="A phone showing a rising lime rate chart, a chrome scorpion beside it" width={670} height={369} />
          </div>
        </div>
        <div className="home-what-text">
          <h2>
            Escorpio reads
            <br />
            every rate
          </h2>
          <p>
            Most money lent on Robinhood Chain sits in Morpho: hundreds of markets and dozens of vaults, each with its own rate.
            Escorpio reads all of them live and keeps only real USDG, matched by contract address.
          </p>
          <p>
            Then it says what the rate hides. A vault closed to deposits, a market almost fully borrowed, a collateral Morpho does
            not recognise. A high rate pays for a risk, and you should see which one.
          </p>
          <Link to="/method" className="button">
            <ArrowSvg />
            Read the method
          </Link>
        </div>
      </div>
    </div>
  )
}

function PhotoGrid() {
  const { desk } = useDesk()
  const total = desk ? desk.vaults.reduce((s, v) => s + v.totalUsd, 0) : 0
  return (
    <div className="home-photo-grid">
      <div className="width">
        <div className="fancy-divider-alt">
          <div className="square" />
          <div className="circle" />
          <div className="circle" />
        </div>
        <header className="home-photo-grid-header">
          <p aria-live="polite">
            {desk ? (
              <>
                <strong>{desk.markets.length}</strong> USDG markets and <strong>{desk.vaults.length}</strong> USDG vaults read live,
                holding <strong>{usd(total)}</strong>.
              </>
            ) : (
              'Reading every USDG market and vault on Robinhood Chain…'
            )}
          </p>
          <div className="k-read">
            <DeskReadout />
          </div>
        </header>
        <Features />
      </div>
    </div>
  )
}

// What Escorpio does, one card per job. Live cards link to their page and carry one number read right now; the
// ones not built yet say so and link nowhere. Card markup follows Chrome's card guide: <article>, the link on the
// heading, stretched over the card in CSS (.k-feature in layout.css), cards aligned with subgrid.
type Feature = { t: string; d: string; img: string; to?: string; stat?: string }

function Features() {
  const { desk } = useDesk()
  const now = desk?.readAt ?? 0
  const best = desk ? headlineVaults(desk)[0] : undefined
  const loans = desk ? collaterals(desk).map((g) => ({ g, m: cheapest(g, 0, now) })).filter((x) => x.m) : []
  const low = loans.reduce<(typeof loans)[number] | undefined>((a, b) => (!a || b.m!.borrowApy < a.m!.borrowApy ? b : a), undefined)
  const flagged = desk ? desk.vaults.filter((v) => vaultNotes(v, now).some((n) => n.stop)).length : 0
  const list: Feature[] = [
    {
      t: 'Compare every rate',
      d: 'Every USDG vault and lending market on Robinhood Chain in one place, read from Morpho every minute.',
      img: 'feat-compare',
      to: '/earn',
      stat: desk ? `${desk.markets.length} markets, ${desk.vaults.length} vaults` : undefined,
    },
    {
      t: 'Park idle USDG',
      d: 'The net rate after fees, what you could take out today, and the reason a high rate is high.',
      img: 'feat-park',
      to: '/earn',
      stat: best ? `Best open rate ${pct(best.netApy)}` : undefined,
    },
    {
      t: 'Borrow against stock tokens',
      d: 'Pick the token you hold and see the cheapest market that can lend right now, and where liquidation starts.',
      img: 'feat-borrow',
      to: '/borrow',
      stat: low ? `Cheapest open loan ${pct(low.m!.borrowApy)} against ${low.g.symbol}` : undefined,
    },
    {
      t: 'Risks in plain words',
      d: 'Closed deposits, stuck withdrawals, unknown collateral and tiny markets are flagged on every row.',
      img: 'feat-risk',
      to: '/method',
      stat: desk ? `${flagged} of ${desk.vaults.length} vaults flagged now` : undefined,
    },
    { t: 'Receive with a link', d: 'Signed payment links and invoices, each with a receipt read from the chain.', img: 'feat-receive' },
    { t: 'Pay out', d: 'Payroll from a pasted list of addresses and amounts, checked line by line before one signature.', img: 'feat-payout' },
  ]
  return (
    <section aria-labelledby="features-title" className="k-features-wrap">
      <h2 id="features-title" className="label">
        What you can do
      </h2>
      <div className="k-features">
        {list.map((f, i) => (
          <article key={f.t} className={`k-feature${f.to ? '' : ' soon'}`}>
            <img src={`/media/${f.img}.webp`} alt="" width={800} height={640} loading="lazy" decoding="async" />
            <header>
              <span className="num">{String(i + 1).padStart(2, '0')}</span>
              <h3>
                {f.to ? (
                  <Link to={f.to} className="card-link">
                    {f.t}
                  </Link>
                ) : (
                  f.t
                )}
              </h3>
            </header>
            <p>{f.d}</p>
            <footer>
              {f.to ? (
                <>
                  <span>
                    <i aria-hidden className="live-dot" />
                    {f.stat ?? 'Reading Morpho…'}
                  </span>
                  <ArrowSvg />
                </>
              ) : (
                <span>Coming next</span>
              )}
            </footer>
          </article>
        ))}
      </div>
    </section>
  )
}

const STEPS = [
  { icon: 'read', t: 'Read Morpho live', d: 'Your browser asks the public Morpho API for every USDG vault and market, every minute.' },
  { icon: 'flag', t: 'Flag the risks', d: 'Closed deposits, nothing to withdraw, unknown collateral: said in plain words.' },
  { icon: 'sign', t: 'Sign in your wallet', d: 'Deposit, borrow and repay right here; each step is simulated first, then you sign. We never touch the money.' },
]

function How() {
  return (
    <div className="home-how">
      <div className="width">
        <div className="home-how-main">
          <h2>
            How does
            <br />
            Escorpio work?
          </h2>
          <p>
            Escorpio has no contract and no wallet of its own. It is a reading desk: the page asks Morpho for every vault and market
            holding USDG on Robinhood Chain, checks each against Morpho's own warnings and a few rules of ours, and shows the
            result with the time it was read.
          </p>
          <p>
            When you deposit into a vault or borrow against a token, you do it on Escorpio and sign in your own wallet. Each
            step is simulated on chain first, the approval is for the exact amount, and the money goes straight between you and
            Morpho. If a number is missing, the page says "no data yet" instead of guessing.
          </p>
        </div>
        <div className="home-how-steps">
          {STEPS.map((s) => (
            <div className="home-how-step" key={s.t}>
              <div className="icon-wrap">
                <div className="icon">
                  <img src={`/media/step-${s.icon}.png`} alt="" width={90} height={90} />
                </div>
              </div>
              <div className="text">
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// "Compare rates" lands here: the coin columns faint behind the title, then the numbered rows with the biggest
// USDG vaults and the cheapest loan per collateral.
function Reserve() {
  const { desk } = useDesk()
  const now = desk?.readAt ?? 0
  const park: RateItem[] = desk
    ? [...desk.vaults]
        .sort((a, b) => b.totalUsd - a.totalUsd)
        .slice(0, 8)
        .map((v) => ({ key: v.address, rate: v.netApy, name: v.name || 'Unnamed vault', to: '/earn', no: vaultNotes(v, now).find((n) => n.stop)?.text }))
    : []
  // Only collaterals with $30k+ lent, so tiny markets stay out of the row; rates of 50% or more are stuck markets.
  const borrow: RateItem[] = desk
    ? collaterals(desk, 30_000)
        .map((g) => ({ g, m: cheapest(g, 0, now) }))
        .filter((x) => x.m && x.m.borrowApy < 0.5)
        .slice(0, 8)
        .map(({ g, m }) => ({ key: g.address, rate: m!.borrowApy, name: g.symbol, to: `/borrow?c=${g.address}` }))
    : []

  return (
    <section className="home-reserve" id="compare" tabIndex={-1} aria-labelledby="compare-title">
      <div className="width">
        <div className="home-reserve-header">
          <picture className="k-reserve-bg" aria-hidden>
            <source type="image/avif" srcSet="/media/reserve-coins.avif" />
            <img src="/media/reserve-coins.webp" alt="" width={1200} height={1218} loading="lazy" decoding="async" />
          </picture>
          <h2 id="compare-title">Compare rates</h2>
          <p>
            The biggest USDG vaults next to the cheapest loan for each token you can borrow against, read live from Morpho.
            Struck-through entries are closed or stuck right now.
          </p>
        </div>
        <RateRow n="01" title="Receive" plates={2} soon="Signed USDG payment links and invoices, each with a receipt read from the chain." />
        <RateRow n="02" title="Park" plates={4} items={park} cta={{ to: '/earn', label: 'Every vault' }} unit="net a year" />
        <RateRow n="03" title="Borrow" plates={6} items={borrow} cta={{ to: '/borrow', label: 'Every loan' }} unit="cheapest loan" />
        <RateRow n="04" title="Pay out" plates={8} soon="Payroll from a pasted list of addresses and amounts, checked line by line before one signature." />
      </div>
    </section>
  )
}
