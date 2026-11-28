import type { ReactNode } from 'react'
import { PageHead } from '@/components/page-head'
import { OWN_NOTES, STOP_CODES, WARNING_TEXT } from '@/data/desk'
import { CHAIN_ID, EXPLORER, MORPHO_API, MORPHO_BLUE, USDG } from '@/data/morpho'


const CODE = 'https://github.com/escorpio-dev/escorpio-app'

// The public API (functions/api). Same readings the pages show.
const API: [string, string][] = [
  ['/api/rates', 'Best open vault, cheapest loan per collateral, widest rate gap.'],
  ['/api/vaults', 'Every USDG vault, best net rate first. Add ?open=1 for open ones only.'],
  ['/api/markets', 'Every USDG loan market, cheapest first. Add ?collateral= with an address or symbol.'],
  ['/api/desk', "Morpho's answer exactly as the site reads it, with the time it was read."],
]

export function MethodPage() {
  return (
    <main className="wrap pb-28 pt-[130px] lg:pt-[180px]">
      <PageHead kicker="Method" title="How every number on Escorpio is read" bg="bg-method">
        Nothing on this site is typed in by hand. Each figure comes from a public source, says when it was read, and shows "no
        data yet" when the source does not answer.
      </PageHead>

      <div className="mt-14 grid grid-cols-[minmax(0,1fr)] gap-x-16 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <Block title="Where it comes from">
          <p>
            Escorpio's own API reads the public Morpho API (<code className="num text-[0.9em]">{MORPHO_API}</code>) at most once a
            minute and passes Morpho's answer through unchanged. Your browser reads that answer when the page opens and again
            every 60 seconds while the tab is open, and checks every row before showing it. If our API does not answer, your
            browser asks Morpho directly. Morpho's own numbers can lag the chain by a short while.
          </p>
          <p className="mt-4">
            Vault sizes are also read a second way: our API asks each vault contract on Robinhood Chain for its asset and its
            total (<code className="num text-[0.9em]">asset()</code> and <code className="num text-[0.9em]">totalAssets()</code>)
            and compares that with Morpho's number. Every answer from the API carries the result as{' '}
            <code className="num text-[0.9em]">checkedOnChain</code>, and each vault row as <code className="num text-[0.9em]">onChain</code>.
          </p>
        </Block>
        <Block title="Check it yourself">
          <p className="mb-4">
            Every number on this site is also public as JSON. No key, no login, open to any app or agent. Each answer says when it
            was read.
          </p>
          <dl className="mb-5 grid gap-3">
            {API.map(([path, text]) => (
              <div key={path} className="grid gap-1 sm:grid-cols-[11rem_1fr]">
                <dt>
                  <a href={path} className="accent-link num text-sm">
                    {path}
                  </a>
                </dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
          <pre className="num overflow-x-auto border border-line-2 p-4 text-[13px] leading-relaxed text-ink">
            {'curl -s https://escorpio.pro/api/rates\n'}
            {'curl -s "https://escorpio.pro/api/markets?collateral=NVDA"\n'}
            {'curl -s "https://escorpio.pro/api/vaults?open=1"'}
          </pre>
          <p className="mt-4">
            To check us against the source, <code className="num text-[0.9em]">/api/desk</code> is Morpho's answer byte for byte,
            and the exact question we ask Morpho is in{' '}
            <a href={`${CODE}/blob/main/site/src/data/morpho.ts`} target="_blank" rel="noopener noreferrer" className="accent-link">
              morpho.ts
            </a>
            . You can also run a deposit or loan simulation yourself without funds: give the MCP prepare tools any address that
            holds USDG as <code className="num text-[0.9em]">wallet</code>. It is a read as that address, nothing is signed. Every
            deposit and loan step is simulated against the real contracts on each change to the code (
            <a href={`${CODE}/actions`} target="_blank" rel="noopener noreferrer" className="accent-link">
              test runs
            </a>
            ).
          </p>
          <p className="mt-4">
            AI agents can use the same readings as tools: add{' '}
            <code className="num text-[0.9em] text-ink">https://escorpio.pro/mcp</code> as an MCP server (no key). For other
            tools there is an{' '}
            <a href="/openapi.json" className="accent-link num text-[0.9em]">
              OpenAPI file
            </a>{' '}
            and a short guide at{' '}
            <a href="/llms.txt" className="accent-link num text-[0.9em]">
              /llms.txt
            </a>
            . Agents can read, not sign: every deposit and loan is still signed by a person in their own wallet.
          </p>
        </Block>
        <Block title="What is in">
          <ul className="grid gap-2">
            <li>Robinhood Chain only (chain ID {CHAIN_ID}).</li>
            <li>
              Real USDG only, matched by contract address. Other tokens on this chain also call themselves "USDG"; vaults holding
              those are left out.
            </li>
            <li>Morpho markets that lend USDG with at least $100 supplied, the 200 biggest.</li>
            <li>Morpho vaults (version 2) whose asset is USDG.</li>
          </ul>
        </Block>
        <Block title="What is not in yet">
          <ul className="grid gap-2">
            <li>Other lending protocols on the chain (LayerBank, Arcadia, Longbow and others). Morpho holds about 99% of lending here.</li>
            <li>Markets under $100 supplied: on 19 Nov 2026 that was 316 of 378 USDG markets, nearly all empty.</li>
            <li>Rewards paid in other tokens. The vault rate shown is Morpho's net rate after the vault's fees.</li>
            <li>Payment links, receipts and payroll. Those are the next things we build.</li>
          </ul>
        </Block>
        <Block title="The headline numbers">
          <dl className="grid gap-4">
            <Term k="Best open USDG vault">
              Highest net rate among vaults that Morpho lists, hold at least $50k, take deposits, have no red Morpho warning and
              let money out right now.
            </Term>
            <Term k="Rate gap">
              The widest difference in borrow rate between two markets that take the same collateral contract at the same
              liquidation point. Both need $10k+ supplied, $1k+ free to borrow and a rate under 100%.
            </Term>
            <Term k="Cheapest loan">
              Lowest borrow rate among markets for that collateral that have the amount you typed (at least $1,000) free right
              now, skipping any market with a stop note.
            </Term>
          </dl>
        </Block>
        <Block title="Words in the tables">
          <dl className="grid gap-4">
            <Term k="Net rate">Yearly rate a depositor earns after the vault's own fees, as Morpho reports it today.</Term>
            <Term k="Withdrawable now">USDG that could leave the vault right now. The rest is lent out.</Term>
            <Term k="Liquidation at (LLTV)">
              If your loan grows past this share of your collateral's value, the market sells collateral to repay it.
            </Term>
            <Term k="Free to borrow">USDG still sitting in the market that a new loan could take.</Term>
            <Term k="Used">Share of supplied USDG that is lent out. Rates rise as this gets close to 100%.</Term>
          </dl>
        </Block>
        <Block title="Risk notes">
          <p className="mb-4">
            Red notes, marked <span className="font-mono">■</span>, are reasons not to use something right now. The others,
            marked <span className="font-mono">□</span>, are things to weigh. No note does not mean safe.
          </p>
          <div className="label mb-2">From Morpho</div>
          <ul className="mb-6 grid gap-1.5">
            {Object.entries(WARNING_TEXT).map(([code, text]) => (
              <li key={code} className={STOP_CODES.has(code) ? 'text-antares-ink' : ''}>
                <span className="mr-1.5 font-mono text-[0.8em]" aria-hidden>{STOP_CODES.has(code) ? '■' : '□'}</span>
                {text} <span className="num text-[11px] text-muted">{code}</span>
              </li>
            ))}
          </ul>
          <div className="label mb-2">Ours</div>
          <ul className="grid gap-2">
            {OWN_NOTES.map(([k, v, stop]) => (
              <li key={k}>
                <span className={stop ? 'text-antares-ink' : 'text-ink'}>
                  <span className="mr-1.5 font-mono text-[0.8em]" aria-hidden>{stop ? '■' : '□'}</span>
                  {k}.
                </span>{' '}
                {v}
              </li>
            ))}
          </ul>
        </Block>
        <Block title="Contracts we read">
          <dl className="grid gap-3">
            <Contract k="USDG" a={USDG} />
            <Contract k="Morpho Blue" a={MORPHO_BLUE} />
          </dl>
          <p className="mt-4">Escorpio has no contract of its own. If a site asks you to approve a contract not on this list, it is not us.</p>
        </Block>
        <Block title="Not advice">
          <p>
            Escorpio is an independent tool, not affiliated with Robinhood or Morpho. It shows readings, not recommendations. A
            higher rate pays for a higher risk, and every rate here can change in the next block.
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

function Term({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-ink">{k}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

function Contract({ k, a }: { k: string; a: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr]">
      <dt className="text-ink">{k}</dt>
      <dd>
        <a href={`${EXPLORER}/address/${a}`} target="_blank" rel="noopener noreferrer" className="accent-link num break-all text-sm">
          {a}
        </a>
      </dd>
    </div>
  )
}
