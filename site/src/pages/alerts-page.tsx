import type { ReactNode } from 'react'
import { ArrowSvg } from '@/components/arrow-svg'
import { PageHead } from '@/components/page-head'
import { TelegramIcon } from '@/components/telegram-icon'
import { PerksTable } from '@/components/token-bits'
import { ALERTS_BOT } from '@/data/alerts-link'
import { headlineVaults, vaultNotes } from '@/data/desk'
import { TOKEN_LIVE } from '@/data/token'
import { pct, usd } from '@/lib/format'
import { useDesk } from '@/lib/use-desk'

// /alerts: the Telegram rate alerts (alerts/ Worker, @EscorpioAlertsBot). Commands and limits mirror alerts/src/logic.ts
// (HELP, LIMITS, RESEND_AFTER_MS, STALE_AFTER_MS). Holder plans show only once the token is live (data/token.ts).
const BOT = `https://t.me/${ALERTS_BOT}`

const COMMANDS: [string, string][] = [
  ['/vault 5', 'Tell me when an open USDG vault pays 5% a year or more.'],
  ['/borrow NVDA 2', 'Tell me when a USDG loan against NVDA costs 2% a year or less.'],
  ['/list', 'Your alerts.'],
  ['/stop', 'Remove all your alerts. /stop 2 removes alert 2.'],
  ['/me', 'Your plan.'],
  ['/help', 'All commands.'],
]
const HOLDER_COMMANDS: [string, string][] = [
  ['/link', 'Link a wallet holding $ESCORPIO for more alerts.'],
  ['/unlink', 'Unlink it.'],
]

const hhmm = (t: number) => new Date(t).toISOString().slice(11, 16)

export function AlertsPage() {
  const { desk } = useDesk()
  const best = desk ? headlineVaults(desk)[0] : undefined
  // The same text the bot sends for /vault, built from this minute's reading (alerts/src/logic.ts check()).
  const example = best && desk
    ? [
        `${best.name} pays ${pct(best.netApy)} a year after fees (your alert: ${pct(Math.floor(best.netApy * 100) / 100)} or more).`,
        `Vault size ${usd(best.totalUsd)}, ${usd(best.withdrawableUsd)} withdrawable now.`,
        ...(vaultNotes(best, desk.readAt).length ? ['Notes:', ...vaultNotes(best, desk.readAt).map((n) => `- ${n.text}`)] : []),
        `Read from Morpho at ${hhmm(desk.readAt)}. A reading, not advice: rates change every block.`,
        'https://escorpio.pro/earn',
      ].join('\n')
    : null
  const commands = TOKEN_LIVE ? [...COMMANDS.slice(0, 5), HOLDER_COMMANDS[0], HOLDER_COMMANDS[1], COMMANDS[5]] : COMMANDS

  return (
    <main className="wrap pb-28 pt-[130px] lg:pt-[180px]">
      <PageHead kicker="Alerts" title="Rate alerts on Telegram" bg="bg-alerts">
        Tell the Escorpio bot a rate. It messages you when an open USDG vault pays that much or more, or when a loan against
        your stock token costs that much or less. Free, no sign-up, nothing to connect.
      </PageHead>

      <div className="mt-10 flex flex-wrap items-center gap-4">
        <a href={BOT} className="button" target="_blank" rel="noopener noreferrer">
          <ArrowSvg />
          Open in Telegram
        </a>
        <span className="k-alerts-note">
          <TelegramIcon size={16} /> @{ALERTS_BOT}, free
        </span>
      </div>

      <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-x-16 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <Block title="Start">
          <ol className="k-alerts-steps">
            <li>
              Open{' '}
              <a href={BOT} className="accent-link" target="_blank" rel="noopener noreferrer">
                @{ALERTS_BOT}
              </a>{' '}
              and press Start.
            </li>
            <li>
              Send a rate, for example <code>/vault 5</code> or <code>/borrow NVDA 2</code>.
            </li>
            <li>Get a message when the desk crosses it. Send /stop anytime.</li>
          </ol>
        </Block>

        <Block title="Commands">
          <dl className="k-alerts-cmds">
            {commands.map(([cmd, what]) => (
              <div key={cmd}>
                <dt>
                  <code>{cmd}</code>
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
        </Block>

        <Block title="What you get">
          <p>
            Every message gives the rate, the vault or market and its size, its risk notes in plain words, and when it was
            read. Never on a reading older than 5 minutes, and at most one message per alert per hour. A reading, not advice.
          </p>
          {example && (
            <figure className="k-alerts-example">
              <figcaption>Example, from this minute's reading</figcaption>
              <pre>{example}</pre>
            </figure>
          )}
        </Block>

        <Block title="Limits">
          <p>
            Free for everyone: 2 alerts, checked every 15 minutes. Loan alerts only fire for markets with at least $10k free to
            borrow and no stop note, so a tiny or stuck market never pings you.
          </p>
          {TOKEN_LIVE && (
            <div className="mt-6">
              <PerksTable />
              <p className="mt-4 text-sm text-muted">
                Holders link a wallet with <code>/link</code>: one signature, not a transaction. Details on{' '}
                <a href="/token" className="accent-link">
                  the token page
                </a>
                .
              </p>
            </div>
          )}
        </Block>
      </div>
    </main>
  )
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h2 className="h-cond !text-[clamp(2rem,4vw,3rem)] border-t border-line-2 pt-5 text-[1.6rem] lg:pb-10">{title}</h2>
      <div className="max-w-2xl min-w-0 border-line pb-10 pt-3 leading-relaxed text-body [overflow-wrap:anywhere] lg:border-t lg:border-line-2 lg:pt-6">{children}</div>
    </>
  )
}
