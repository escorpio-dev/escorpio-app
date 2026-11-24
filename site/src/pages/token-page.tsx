import type { ReactNode } from 'react'
import { PageHead } from '@/components/page-head'
import { CaBox, PerksTable, holderMinText } from '@/components/token-bits'
import { ALERTS_BOT } from '@/data/alerts-link'
import { CHAIN_ID } from '@/data/morpho'
import { TOKEN_ADDRESS, tokenLinks } from '@/data/token'

// /token: the $ESCORPIO contract address, where to check it, what holding changes and how to link a wallet.
// Routed only once TOKEN_LIVE (main.tsx). The supply and pool lines are Pons facts: check them on Blockscout on launch day.
// Never a fee section (launch-kit/LAUNCH.md).
export function TokenPage() {
  return (
    <main className="wrap pb-28 pt-[130px] lg:pt-[180px]">
      <PageHead kicker="$ESCORPIO" title="The Escorpio token">
        Holding $ESCORPIO unlocks more of the desk. The desk itself stays free for everyone. This page holds the only contract
        address Escorpio uses; anything else is not us.
      </PageHead>

      <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-x-16 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <Block title="Contract">
          <CaBox />
          <p className="mt-4 text-sm text-muted">
            Robinhood Chain (chain {CHAIN_ID}). Launched on Pons, paired with WETH. Fixed supply of 1,000,000,000.
          </p>
          <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
            {tokenLinks(TOKEN_ADDRESS).map(([name, href]) => (
              <li key={name}>
                <a href={href} className="accent-link" target="_blank" rel="noopener noreferrer">
                  {name} ↗
                </a>
              </li>
            ))}
          </ul>
        </Block>

        <Block title="What holding changes">
          <p className="mb-6">
            Hold at least <strong className="text-ink">{holderMinText()}</strong> in one wallet and link it. The threshold is
            announced before it ever changes.
          </p>
          <PerksTable />
        </Block>

        <Block title="Link a wallet">
          <ol className="grid list-decimal gap-3 pl-5">
            <li>
              Open{' '}
              <a href={`https://t.me/${ALERTS_BOT}`} className="accent-link" target="_blank" rel="noopener noreferrer">
                @{ALERTS_BOT}
              </a>{' '}
              on Telegram and send <code className="num text-ink">/link</code>.
            </li>
            <li>Open the link it sends you. It works for 15 minutes.</li>
            <li>Connect the wallet that holds $ESCORPIO and sign one message. A signature, not a transaction: it costs nothing and moves nothing.</li>
          </ol>
          <p className="mt-4">
            The balance is read again every day. Below the threshold the plan goes back to free; alerts over the free limit are
            paused, not deleted. <code className="num text-ink">/unlink</code> anytime.
          </p>
        </Block>

        <Block title="What it is not">
          <p>
            Not a share of Escorpio, not a claim on any money, no yield, no burn, no buyback. Escorpio never asks for a seed
            phrase or a private key, never asks you to approve a token, and does not message first.
          </p>
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
