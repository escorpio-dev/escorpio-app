import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { ClaudeMark, CursorMark, HermesMark, OpenAIMark, SkillsShMark } from '@/components/agent-marks'
import { PageHead } from '@/components/page-head'

// /docs: how to plug Escorpio into an agent (MCP server, agent skill) or call the JSON API. Each section has an id the
// "Works with" logos on home link to (#claude, #chatgpt, #cursor, #hermes, #skills). Client menus change over time, so
// every client section leads with what does not change: the URL, no key, and that no tool can sign.
const MCP_URL = 'https://escorpio.pro/mcp'
const SKILL = 'npx skills add escorpio-dev/escorpio-app'

const TOOLS: [string, string, string][] = [
  ['get_best_rates', 'none', 'Start here. Best open vault, biggest open vault, cheapest loan per collateral, widest rate gap.'],
  ['list_vaults', 'open_only, limit', 'Every USDG vault, best net rate first. open_only keeps the ones Escorpio would headline.'],
  ['list_markets', 'collateral, limit', 'Every USDG loan market, cheapest first. collateral takes a symbol (NVDA) or an address.'],
  ['explain_risk_notes', 'none', 'What every risk note means, and which ones are a stop.'],
  ['prepare_deposit', 'vault, amount_usdg, wallet?', 'A deposit into one vault, checked and (with wallet) simulated. Returns open_url: escorpio.pro with the form filled in.'],
  ['prepare_withdraw', 'vault, amount_usdg or "all", wallet?', 'A withdrawal back to the wallet, checked and simulated.'],
  ['prepare_borrow', 'market_id, collateral_amount?, borrow_usdg?, wallet?', 'Collateral in and/or a USDG loan. Refused past 90% of the liquidation line. With wallet: loan after, liquidation price, steps, simulation.'],
  ['prepare_repay', 'market_id, amount_usdg or "all", wallet?', 'A repayment, checked and simulated.'],
  ['prepare_collateral_withdraw', 'market_id, collateral_amount, wallet?', 'Collateral back to the wallet, refused if the loan would pass the 90% limit.'],
  ['prepare_payment_request', 'amount_usdg, memo?, valid_days?', 'A USDG invoice: a link to /receive that the payee opens and signs.'],
  ['check_payment', 'tx_hash, payment_link?', 'A payment read from the chain, and whether it paid that request.'],
]

const API: [string, string][] = [
  ['/api/rates', 'Best open vault, biggest open vault, cheapest loan per collateral, widest rate gap.'],
  ['/api/vaults', 'Every USDG vault, best net rate first. ?open=1 for open ones only.'],
  ['/api/markets', 'Every USDG loan market, cheapest first. ?collateral=NVDA or an address.'],
  ['/api/desk', "Morpho's answer exactly as the site reads it; read time in the x-escorpio-read-at header."],
  ['/api/stats', 'escorpio.pro traffic per UTC day from Cloudflare, bots included.'],
]

export function DocsPage() {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }))
  }, [hash])

  return (
    <main className="wrap pb-28 pt-[130px] lg:pt-[180px]">
      <PageHead kicker="Docs" title="Plug Escorpio into your agent" bg="bg-docs">
        One MCP server, one agent skill and a public JSON API, all reading the same live desk. No key, no sign-up. Agents
        read and prepare: a deposit, loan or invoice comes back as a link to escorpio.pro with the form filled in, and only
        the wallet owner can sign it.
      </PageHead>

      <nav className="k-docs-toc" aria-label="On this page">
        {(
          [
            ['#mcp', 'MCP server'],
            ['#claude', 'Claude'],
            ['#chatgpt', 'ChatGPT'],
            ['#cursor', 'Cursor'],
            ['#hermes', 'Hermes Agent'],
            ['#skills', 'Agent skill'],
            ['#api', 'JSON API'],
            ['#rules', 'Rules for answers'],
          ] as const
        ).map(([to, name]) => (
          <a key={to} href={to}>
            {name}
          </a>
        ))}
      </nav>

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-x-16 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <Block id="mcp" title="MCP server">
          <p>Remote MCP server, Streamable HTTP, no authentication. Tools read or prepare; none can sign, send or approve:</p>
          <Code text={MCP_URL} />
          <table className="k-docs-table mt-6">
            <thead>
              <tr>
                <th scope="col">Tool</th>
                <th scope="col">Arguments</th>
                <th scope="col">Returns</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map(([name, args, what]) => (
                <tr key={name}>
                  <th scope="row">
                    <code>{name}</code>
                  </th>
                  <td>{args}</td>
                  <td>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm text-muted">
            Every answer carries <code>readAt</code>. Rates are percent per year, money is US dollars. A prepare tool given
            a <code>wallet</code> reads that wallet and simulates the whole plan on chain (no transaction); the address is
            not stored. Its <code>open_url</code> opens the page filled in, which reads the wallet again and simulates again
            before the owner signs.
          </p>
        </Block>

        <Block id="claude" title="Claude" mark={<ClaudeMark size={28} />}>
          <p>Claude Code:</p>
          <Code text={`claude mcp add --transport http escorpio ${MCP_URL}`} />
          <p className="mt-5">
            Claude app (web or desktop): add a custom connector in Settings › Connectors with the URL above, no
            authentication. Custom connectors depend on your Claude plan.
          </p>
        </Block>

        <Block id="chatgpt" title="ChatGPT" mark={<OpenAIMark size={28} />}>
          <p>
            Add Escorpio as a custom connector (MCP) in ChatGPT's settings, where your plan allows developer mode or custom
            connectors. Use the URL below and choose no authentication. Menu names change; the URL does not.
          </p>
          <Code text={MCP_URL} />
        </Block>

        <Block id="cursor" title="Cursor" mark={<CursorMark size={28} />}>
          <p>
            Add to <code>~/.cursor/mcp.json</code> (all projects) or <code>.cursor/mcp.json</code> (one project):
          </p>
          <Code text={`{\n  "mcpServers": {\n    "escorpio": { "url": "${MCP_URL}" }\n  }\n}`} />
          <p className="mt-5">Or install the skill for Cursor:</p>
          <Code text={`${SKILL} -a cursor`} />
        </Block>

        <Block id="hermes" title="Hermes Agent" mark={<HermesMark size={28} />}>
          <p>
            As an MCP server: add it under <code>mcp_servers</code> in <code>~/.hermes/config.yaml</code>, then run{' '}
            <code>/reload-mcp</code> in a session.
          </p>
          <Code text={`mcp_servers:\n  escorpio:\n    url: "${MCP_URL}"`} />
          <p className="mt-5">Check it, or install the skill instead:</p>
          <Code text="hermes mcp test escorpio" />
          <Code text="hermes skills install escorpio-dev/escorpio-app/skills/escorpio" />
        </Block>

        <Block id="skills" title="Agent skill" mark={<SkillsShMark size={28} />}>
          <p>
            The same desk as an Agent Skill (<code>SKILL.md</code>): how to read it over MCP or the JSON API, and the rules
            for answering. Works with Claude Code, Cursor, Codex and other agents through the skills CLI, listed on
            skills.sh. Needs Node.js 22.20 or later.
          </p>
          <Code text={SKILL} />
          <p className="mt-5">One agent only, for example Claude Code:</p>
          <Code text={`${SKILL} --skill escorpio -a claude-code`} />
          <p className="mt-5 text-sm text-muted">
            Source:{' '}
            <a href="https://github.com/escorpio-dev/escorpio-app/tree/main/skills/escorpio" className="accent-link" target="_blank" rel="noopener noreferrer">
              skills/escorpio on GitHub
            </a>
            .
          </p>
        </Block>

        <Block id="api" title="JSON API">
          <p>
            Plain HTTPS GET, no key, open to any origin. Each reading is at most a minute old. Full schema in{' '}
            <a href="/openapi.json" className="accent-link">
              openapi.json
            </a>
            , a summary for language models in{' '}
            <a href="/llms.txt" className="accent-link">
              llms.txt
            </a>
            .
          </p>
          <dl className="k-docs-api mt-6">
            {API.map(([path, what]) => (
              <div key={path}>
                <dt>
                  <a href={path} className="accent-link">
                    <code>{path}</code>
                  </a>
                </dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>
          <Code text="curl https://escorpio.pro/api/rates" />
        </Block>

        <Block id="rules" title="Rules for answers">
          <ul className="k-docs-rules">
            <li>Read first, then answer. Never quote a rate from memory: rates change every block.</li>
            <li>With every vault or loan, give the rate, its size, its risk notes in plain words, and when it was read.</li>
            <li>A note marked stop (deposits closed, withdrawals stuck) means do not send anyone there.</li>
            <li>For loans, mention the liquidation LTV: a stock token can fall and the loan can be liquidated.</li>
            <li>Never call anything safe or guaranteed, and never tell someone to deposit or borrow. Readings, not advice.</li>
            <li>Prepare only what the person asked for. Before you give an <code>open_url</code>, say what it does: the amount, the vault or market, its rate and risk notes, and for a loan the liquidation price.</li>
            <li>A prepared link is not a payment. Never say money moved until the person signed and <code>check_payment</code> or the explorer shows it.</li>
            <li>Never sign, send or approve anything, and never ask for a seed phrase or private key.</li>
          </ul>
        </Block>
      </div>
    </main>
  )
}

function Block({ id, title, mark, children }: { id: string; title: string; mark?: ReactNode; children: ReactNode }) {
  return (
    <>
      <h2 id={id} className="k-docs-h h-cond !text-[clamp(2rem,4vw,3rem)] border-t border-line-2 pt-5 text-[1.6rem] lg:pb-10">
        {mark && <span className="k-docs-mark">{mark}</span>}
        {title}
      </h2>
      <div className="max-w-2xl min-w-0 border-line pb-10 pt-3 leading-relaxed text-body [overflow-wrap:anywhere] lg:border-t lg:border-line-2 lg:pt-6">{children}</div>
    </>
  )
}

function Code({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="k-docs-code">
      <pre>
        <code>{text}</code>
      </pre>
      <button type="button" onClick={copy} aria-live="polite">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
