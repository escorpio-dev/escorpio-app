import { useState, type FormEvent, type ReactElement } from 'react'
import { ClaudeMark, CursorMark, HermesMark, OpenAIMark, SkillsShMark } from '@/components/agent-marks'
import { Link } from 'react-router'
import { ArrowSvg } from '@/components/arrow-svg'
import { DeskReadout } from '@/components/desk-readout'
import { RateRow, type RateItem } from '@/components/rate-row'
import { TelegramIcon } from '@/components/telegram-icon'
import { HeroCa, PerksTable, holderMinText } from '@/components/token-bits'
import { ALERTS_BOT } from '@/data/alerts-link'
import { TOKEN_LIVE } from '@/data/token'
import { cheapest, collaterals, headlineVaults, vaultNotes, yearly } from '@/data/desk'
import { ago, pct, usd, usdg } from '@/lib/format'
import { useDesk, useNow } from '@/lib/use-desk'

// Home page (styles in layout.css): hero with the amount box, what Escorpio does, pictures, the rate rows with live
// Morpho numbers, the same desk for people and their AI agents, and how it works.
export function HomePage() {
  return (
    <main className="home-wrap">
      <Top />
      <Intro />
      <What />
      <PhotoGrid />
      <Reserve />
      <Agents />
      {TOKEN_LIVE && <Token />}
      <How />
    </main>
  )
}

// The hero is a looping video (start frame = end frame); with reduced motion only the still shows.
const stillOnly = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// The hero holds the amount box. Typing shows a year
// at today's best open vault rate right here; the button scrolls down to the rate rows (#compare) on this page.
// The hero follows the @escorpiohq X banner: copy on the left over clean black, the video on the right (on phones the
// video sits above the copy). It says first that Escorpio compares rates; earning or borrowing comes after, in the
// visitor's own wallet. Not a staking pool: Escorpio never holds money.
function Top() {
  const [still] = useState(stillOnly)
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
        <div className="home-top-copy">
          <p className="k-kicker">Compare · then earn or borrow</p>
          <h1>
            The USDG desk
            <br />
            <span className="k-accent">for Robinhood Chain</span>
          </h1>
          <p className="k-lede">
            Compare every vault and loan rate, see what each one hides, then earn or borrow right here from your own wallet.
          </p>
          <div className="k-hero-cta">
            <Link to="/earn" className="button">
              <ArrowSvg />
              Compare vault rates
            </Link>
            <Link to="/borrow" className="k-button-ghost">
              Compare loan rates
            </Link>
          </div>
          <p className="k-trust">Live from Morpho · Escorpio never holds your money · Every risk flagged · Works with AI agents</p>
          <HeroCa />
        </div>
      </div>
    </div>
  )
}

// How much is sitting still: a year at today's best open vault rate, as a snapshot (moved from the hero to Compare rates).
function IdleCalc() {
  const { desk } = useDesk()
  const [raw, setRaw] = useState('')
  const amount = Math.max(0, Math.min(1e12, Number(raw.replace(/,/g, '')) || 0))
  const best = desk ? headlineVaults(desk)[0] : undefined
  const submit = (e: FormEvent) => e.preventDefault()
  return (
    <form onSubmit={submit} className="k-amount">
      <label htmlFor="idle" className="k-amount-label">
        How much USDG is sitting still?
      </label>
      <div className="relative">
        <input id="idle" inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="10,000 USDG" />
        <Link to="/earn" className="button">
          <ArrowSvg />
          Put it to work
        </Link>
      </div>
      <p className="k-yield" aria-live="polite">
        {best && amount > 0 ? (
          <>
            A year in {best.name} ({usd(best.totalUsd)} inside) at {pct(best.netApy)}: <strong>+{usdg(yearly(amount, best.netApy))} USDG</strong>, if the rate held. A snapshot, not a promise.
          </>
        ) : (
          ' '
        )}
      </p>
    </form>
  )
}

// $ESCORPIO, shown only once the token exists (data/token.ts). What holding changes, nothing that is not switched on.
function Token() {
  return (
    <section className="home-agents home-token" aria-labelledby="token-title">
      <div className="width">
        <div className="fancy-divider">
          <div className="circle" />
          <div className="circle" />
        </div>
        <h2 id="token-title">
          Hold $ESCORPIO,
          <br />
          get more desk
        </h2>
        <p className="home-agents-lede">
          The desk stays free for everyone. Holding at least {holderMinText()} unlocks more of it: more rate alerts, checked
          every minute, a daily digest, and new features first. It is not a share of anything and pays nothing.
        </p>
        <PerksTable />
        <div className="home-agents-cta">
          <a href={`https://t.me/${ALERTS_BOT}`} className="button" target="_blank" rel="noopener noreferrer">
            <ArrowSvg />
            Start on Telegram
          </a>
          <Link to="/token" className="k-link">
            Contract address and how to link a wallet
          </Link>
        </div>
      </div>
    </section>
  )
}

function Intro() {
  return (
    <div className="home-intro">
      <div className="width">
        <p>
          <span className="k-accent">Escorpio</span> shows live rates for every USDG vault and loan on Robinhood Chain. You can
          park idle money, borrow against your stock tokens, or just compare, yourself or through your AI agent. No sign-up, no
          custody, no made-up numbers.
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
          <div className="home-what-actions">
            <Link to="/method" className="button">
              <ArrowSvg />
              Read the method
            </Link>
            <a href={`https://t.me/${ALERTS_BOT}`} className="k-link k-telegram" target="_blank" rel="noopener noreferrer">
              <TelegramIcon />
              Rate alerts on Telegram
            </a>
          </div>
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
  // Same rule as the Borrow row below: collaterals with $30k+ lent and rates under 50%, so a tiny or stuck market
  // never becomes the headline.
  const loans = desk ? collaterals(desk, 30_000).map((g) => ({ g, m: cheapest(g, 0, now) })).filter((x) => x.m && x.m.borrowApy < 0.5) : []
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
      stat: best ? `Best open rate ${pct(best.netApy)}, a ${usd(best.totalUsd)} vault` : undefined,
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
  ]
  // Roadmap: not live. Shown under its own label, greyed, with no link and no number.
  const next: Feature[] = [
    { t: 'Receive with a link', d: 'Signed USDG payment links and invoices, each with a receipt read from the chain.', img: 'feat-receive' },
    { t: 'Pay out', d: 'Payroll from a pasted list of addresses and amounts, checked line by line before one signature.', img: 'feat-payout' },
  ]
  return (
    <section aria-labelledby="features-title" className="k-features-wrap">
      <h2 id="features-title" className="label">
        What you can do
      </h2>
      <div className="k-features">
        {list.map((f, i) => (
          <article key={f.t} className="k-feature">
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
              ) : null}
            </footer>
          </article>
        ))}
      </div>
      <section aria-labelledby="roadmap-title" className="k-roadmap">
        <h2 id="roadmap-title">Next on the desk · not live yet</h2>
        <div className="k-features">
          {next.map((f, i) => (
            <article key={f.t} className="k-feature soon">
              <img src={`/media/${f.img}.webp`} alt="" width={800} height={640} loading="lazy" decoding="async" />
              <header>
                <span className="num">Next {String(i + 1).padStart(2, '0')}</span>
                <h3>{f.t}</h3>
              </header>
              <p>{f.d}</p>
              <footer>
                <span>Not live yet{TOKEN_LIVE && ' · holders first'}</span>
              </footer>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}

// The same desk for people and for AI agents. People use the pages; agents plug in the MCP server (functions/mcp.ts)
// or the API and get the same readings. Agents read, they never sign: the exchange below is built from this minute's
// reading, exactly what the get_best_rates tool returns, never typed in.
const MCP_URL = 'https://escorpio.pro/mcp'
const AGENT_TOOLS = [
  ['get_best_rates', 'best open vault, cheapest loan per token'],
  ['list_vaults', 'every USDG vault with its risk notes'],
  ['list_markets', 'every loan market, filter by token'],
  ['explain_risk_notes', 'what each warning means'],
]

// Agents and directories Escorpio plugs into, with their official marks (components/agent-marks.tsx).
// MCP clients take https://escorpio.pro/mcp; skills.sh and Hermes also install the skill (skills/escorpio).
const WORKS_WITH: [string, string, string, (p: { size?: number }) => ReactElement][] = [
  ['Claude', 'MCP', 'claude', ClaudeMark],
  ['ChatGPT', 'MCP', 'chatgpt', OpenAIMark],
  ['Cursor', 'MCP or skill', 'cursor', CursorMark],
  ['Hermes Agent', 'MCP or skill', 'hermes', HermesMark],
  ['skills.sh', 'Agent skill', 'skills', SkillsShMark],
]

function WorksWith() {
  return (
    <div className="k-works">
      <span className="k-works-label">
        Works with · <Link to="/docs">setup docs</Link>
      </span>
      <ul>
        {WORKS_WITH.map(([name, how, id, Mark]) => (
          <li key={name}>
            <Link to={`/docs#${id}`} aria-label={`Set up Escorpio in ${name}`}>
              <Mark size={22} />
              <span>
                <b>{name}</b>
                <small>{how}</small>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Agents() {
  const { desk } = useDesk()
  const now = useNow()
  const [copied, setCopied] = useState(false)
  const best = desk ? headlineVaults(desk)[0] : undefined
  const nvda = desk ? collaterals(desk).find((g) => g.symbol === 'NVDA') : undefined
  const loan = nvda && desk ? cheapest(nvda, 0, desk.readAt) : undefined
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(MCP_URL)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }
  return (
    <section className="home-agents" aria-labelledby="agents-title">
      <div className="width">
        <div className="fancy-divider">
          <div className="circle" />
          <div className="circle" />
        </div>
        <h2 id="agents-title">
          For you
          <br />
          and your agent
        </h2>
        <p className="home-agents-lede">
          Everything Escorpio reads is open to people and to AI agents. Ask on the page or ask your agent: the rates are the
          same, read the same minute. Whoever asks, the money only moves when you sign.
        </p>
        <WorksWith />
        <div className="home-agents-cols">
          <article className="home-agents-col">
            <span className="who">01 · You</span>
            <h3>Use the desk</h3>
            <ul>
              <li>Compare every USDG vault and loan on Robinhood Chain.</li>
              <li>Deposit, withdraw, borrow and repay from your own wallet.</li>
              <li>Each step is simulated before you sign, approvals for the exact amount.</li>
            </ul>
            <div className="home-agents-cta">
              <Link to="/earn" className="button">
                <ArrowSvg />
                Park USDG
              </Link>
              <Link to="/borrow" className="k-link">
                or borrow against a stock token
              </Link>
            </div>
          </article>
          <article className="home-agents-col">
            <span className="who">02 · Your agent</span>
            <h3>Plug in Escorpio</h3>
            <p>
              Add Escorpio as an MCP server in Claude, ChatGPT, Cursor, Hermes or any agent that speaks MCP. No key, no sign-up.
            </p>
            <div className="k-endpoint">
              <code>{MCP_URL}</code>
              <button type="button" className="button" onClick={copy} aria-live="polite">
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <ul className="home-agents-tools">
              {AGENT_TOOLS.map(([name, what]) => (
                <li key={name}>
                  <code>{name}</code> {what}
                </li>
              ))}
            </ul>
            <div className="home-agents-skill">
              <span>Or as a skill</span>
              <code>npx skills add escorpio-dev/escorpio-app</code>
              <code>hermes skills install escorpio-dev/escorpio-app/skills/escorpio</code>
            </div>
            <p className="home-agents-small">
              Agents read, they do not sign. Your agent finds the rate and the market; the deposit or loan still happens here,
              in your wallet. Setup for each agent in the <Link to="/docs">docs</Link>, also as an <a href="/openapi.json">OpenAPI file</a> and <a href="/llms.txt">llms.txt</a>.
            </p>
          </article>
        </div>
        <figure className="home-agents-chat" aria-live="polite">
          <figcaption>What an agent gets through Escorpio, from this minute's reading</figcaption>
          <p className="chat-q">Where can I park 10,000 USDG on Robinhood Chain?</p>
          <p className="chat-tool">get_best_rates</p>
          <p className="chat-a">
            {best && desk ? (
              <>
                {best.name}, a {usd(best.totalUsd)} vault, pays {pct(best.netApy)} a year after fees, read {ago(desk.readAt, now)}. At that rate 10,000 USDG
                would earn about {usdg(yearly(10_000, best.netApy))} USDG in a year, if the rate held. Deposit from your own
                wallet at escorpio.pro/earn.
              </>
            ) : (
              'Reading Morpho…'
            )}
          </p>
          <p className="chat-q">And the cheapest USDG loan against NVDA?</p>
          <p className="chat-tool">get_best_rates · cheapest loan per collateral</p>
          <p className="chat-a">
            {desk ? (
              loan ? (
                <>
                  {pct(loan.borrowApy)} a year in the market that liquidates at {pct(loan.lltv, 1)} of the collateral value,
                  with {usd(loan.availableUsd)} free to borrow now. Borrow from your own wallet at escorpio.pro/borrow.
                </>
              ) : (
                'No NVDA market has $1,000 free to borrow right now.'
              )
            ) : (
              'Reading Morpho…'
            )}
          </p>
        </figure>
      </div>
    </section>
  )
}

const STEPS = [
  { icon: 'read', t: 'Read Morpho live', d: 'Escorpio reads every USDG vault and market from the public Morpho API, every minute.' },
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
          <IdleCalc />
        </div>
        <RateRow n="01" title="Park" plates={4} items={park} cta={{ to: '/earn', label: 'Every vault' }} unit="net a year" />
        <RateRow n="02" title="Borrow" plates={6} items={borrow} cta={{ to: '/borrow', label: 'Every loan' }} unit="cheapest loan" />
      </div>
    </section>
  )
}
