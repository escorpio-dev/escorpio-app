// Escorpio's MCP server (Model Context Protocol, Streamable HTTP transport, stateless, JSON responses only).
// Four reading tools over the same readings as /api, plus agent tools (server/agent.ts) that prepare a deposit, loan
// action or payment request for the wallet owner to sign on escorpio.pro. Nothing here can sign, send or hold anything.
// Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
import { OWN_NOTES, STOP_CODES, WARNING_TEXT, headlineVaults } from '../src/data/desk.ts'
import type { PublicClient } from 'viem'
import { AGENT_ARGS, AGENT_TOOLS, callAgentTool } from './agent.ts'
import { about, marketOut, rates, vaultOut, type ServerDesk } from './api.ts'

export const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const SERVER = { name: 'escorpio', title: 'Escorpio', version: '0.2.0', websiteUrl: 'https://escorpio.pro' }
const INSTRUCTIONS =
  'Escorpio reads live Morpho vault and loan rates for USDG on Robinhood Chain (chain 4663). Start with get_best_rates. ' +
  'Every vault and market carries plain-word risk notes; a note with stop=true is a reason not to use it right now, and no ' +
  'note does not mean safe. Quote the readAt time with any rate. These are readings, not advice: do not tell anyone a ' +
  'rate is safe or guaranteed. To act, use the prepare_* tools: each one checks the request, can simulate it for a wallet ' +
  'address, and returns open_url, a link to escorpio.pro with the form filled in. Only the wallet owner can sign there; ' +
  'you cannot sign or send. Tell the person what they are about to sign (amount, vault or market, rate, risk notes, ' +
  'liquidation price for loans) before giving the link. For invoices use prepare_payment_request, then check_payment.'

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
const limit = { type: 'integer', minimum: 1, maximum: 100, description: 'Most rows to return (default 20).' }

export const TOOLS = [
  {
    name: 'get_best_rates',
    title: 'Best USDG rates now',
    description:
      'Headline readings: the best open USDG vault (Morpho, Robinhood Chain) and the biggest open one (quote the size with any rate: the best rate can sit in a small vault), the open vaults by net rate, the cheapest USDG loan per collateral token, and the widest borrow-rate gap for the same collateral and liquidation point.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'Best USDG rates now', ...READ_ONLY },
  },
  {
    name: 'list_vaults',
    title: 'USDG vaults',
    description:
      'Morpho vaults on Robinhood Chain that hold real USDG, best net rate first, with size, what can be withdrawn now, curators and risk notes.',
    inputSchema: {
      type: 'object',
      properties: {
        open_only: { type: 'boolean', description: 'Only vaults Escorpio would headline: listed, open, $50k+, no stop note.' },
        limit,
      },
      additionalProperties: false,
    },
    annotations: { title: 'USDG vaults', ...READ_ONLY },
  },
  {
    name: 'list_markets',
    title: 'USDG loan markets',
    description:
      'Morpho markets lending USDG on Robinhood Chain, cheapest borrow rate first, with liquidation point, free liquidity and risk notes. Filter by collateral token address (preferred) or symbol such as NVDA.',
    inputSchema: {
      type: 'object',
      properties: {
        collateral: { type: 'string', maxLength: 64, description: 'Collateral token address or symbol. Look-alike tokens can share a symbol.' },
        limit,
      },
      additionalProperties: false,
    },
    annotations: { title: 'USDG loan markets', ...READ_ONLY },
  },
  {
    name: 'explain_risk_notes',
    title: 'What the risk notes mean',
    description: 'Every risk note Escorpio can show, in plain words, and which ones are reasons to stop.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { title: 'What the risk notes mean', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  ...AGENT_TOOLS,
]

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: unknown; params?: Record<string, unknown> }
type Out = { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string } }

const ok = (id: Rpc['id'], result: unknown): Out => ({ jsonrpc: '2.0', id: id ?? null, result })
const err = (id: Rpc['id'], code: number, message: string): Out => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })
const clamp = (v: unknown, d = 20) => (typeof v === 'number' && Number.isInteger(v) ? Math.min(100, Math.max(1, v)) : d)

function riskNotes() {
  return {
    note: 'stop=true means a reason not to use it right now. No note does not mean safe.',
    fromMorpho: Object.entries(WARNING_TEXT).map(([code, text]) => ({ code, text, stop: STOP_CODES.has(code) })),
    fromEscorpio: OWN_NOTES.map(([text, meaning, stop]) => ({ text, meaning, stop })),
    method: 'https://escorpio.pro/method',
  }
}

/** Runs one tool. Unknown arguments are rejected by name so a model sees its mistake. */
export async function callTool(name: string, args: Record<string, unknown>, desk: () => Promise<ServerDesk>, pc?: PublicClient) {
  const allowed: Record<string, string[]> = {
    get_best_rates: [],
    list_vaults: ['open_only', 'limit'],
    list_markets: ['collateral', 'limit'],
    explain_risk_notes: [],
    ...AGENT_ARGS,
  }
  if (!(name in allowed)) throw Object.assign(new Error(`Unknown tool: ${name}`), { rpc: -32602 })
  const extra = Object.keys(args).filter((k) => !allowed[name].includes(k))
  if (extra.length) return { isError: true, content: [{ type: 'text', text: `Unknown argument(s) for ${name}: ${extra.join(', ')}` }] }
  if (name === 'explain_risk_notes') return result(riskNotes())
  if (name in AGENT_ARGS) return callAgentTool(name, args, desk, pc)

  const d = await desk()
  if (name === 'get_best_rates') return result(rates(d))
  if (name === 'list_vaults') {
    const open = args.open_only === true
    const list = open ? headlineVaults(d) : [...d.vaults].sort((a, b) => b.netApy - a.netApy)
    const n = clamp(args.limit)
    return result({ ...about(d), filter: open ? 'open' : 'all', total: list.length, vaults: list.slice(0, n).map((v) => vaultOut(v, d.readAt, d.chain)) })
  }
  const q = typeof args.collateral === 'string' ? args.collateral.trim().toLowerCase().slice(0, 64) : ''
  const list = d.markets
    .filter((m) => !q || m.collateral.address.toLowerCase() === q || m.collateral.symbol.toLowerCase() === q)
    .sort((a, b) => a.borrowApy - b.borrowApy)
  const n = clamp(args.limit)
  return result({ ...about(d), filter: q ? { collateral: q } : 'all', total: list.length, markets: list.slice(0, n).map((m) => marketOut(m, d.readAt)) })
}

const result = (data: Record<string, unknown>) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data })

/** Handles one JSON-RPC message. Returns undefined for notifications (no reply). */
/** pc: the chain client for the agent tools (server/rpc.ts); the public client when left out. */
export async function handle(msg: Rpc, desk: () => Promise<ServerDesk>, pc?: PublicClient): Promise<Out | undefined> {
  if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return err(msg?.id, -32600, 'Invalid request')
  const isNotification = !('id' in msg) || msg.id === undefined
  if (isNotification) return undefined
  const { id, method } = msg
  const params = msg.params && typeof msg.params === 'object' ? msg.params : {}
  try {
    switch (method) {
      case 'initialize': {
        const asked = typeof params.protocolVersion === 'string' ? params.protocolVersion : ''
        return ok(id, {
          protocolVersion: SUPPORTED_VERSIONS.includes(asked) ? asked : SUPPORTED_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER,
          instructions: INSTRUCTIONS,
        })
      }
      case 'ping':
        return ok(id, {})
      case 'tools/list':
        return ok(id, { tools: TOOLS })
      case 'tools/call': {
        const name = typeof params.name === 'string' ? params.name : ''
        const args = params.arguments && typeof params.arguments === 'object' ? (params.arguments as Record<string, unknown>) : {}
        try {
          return ok(id, await callTool(name, args, desk, pc))
        } catch (e) {
          const code = (e as { rpc?: number }).rpc
          if (code) return err(id, code, (e as Error).message)
          const msg = (e as { shortMessage?: string; details?: string }).details ?? (e as { shortMessage?: string }).shortMessage ?? (e as Error).message
          const busy = /too many requests|rate limit|429/i.test(msg)
          return ok(id, {
            isError: true,
            content: [{ type: 'text', text: busy ? 'The Robinhood Chain RPC is busy (too many requests). Try again in a few seconds.' : `Could not read Morpho or Robinhood Chain right now: ${msg}` }],
          })
        }
      }
      case 'resources/list':
        return ok(id, { resources: [] })
      case 'prompts/list':
        return ok(id, { prompts: [] })
      default:
        return err(id, -32601, `Method not found: ${method}`)
    }
  } catch (e) {
    return err(id, -32603, e instanceof Error ? e.message : 'Internal error')
  }
}
