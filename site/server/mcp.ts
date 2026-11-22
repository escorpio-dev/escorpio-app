// Escorpio's MCP server (Model Context Protocol, Streamable HTTP transport, stateless, JSON responses only).
// Read-only: four tools over the same readings as /api. Nothing here can sign, send or hold anything.
// Spec: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
import { OWN_NOTES, STOP_CODES, WARNING_TEXT, headlineVaults } from '../src/data/desk.ts'
import type { Desk } from '../src/data/morpho.ts'
import { about, marketOut, rates, vaultOut } from './api.ts'

export const SUPPORTED_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
const SERVER = { name: 'escorpio', title: 'Escorpio', version: '0.1.0', websiteUrl: 'https://escorpio.pro' }
const INSTRUCTIONS =
  'Escorpio reads live Morpho vault and loan rates for USDG on Robinhood Chain (chain 4663). Start with get_best_rates. ' +
  'Every vault and market carries plain-word risk notes; a note with stop=true is a reason not to use it right now, and no ' +
  'note does not mean safe. Quote the readAt time with any rate. These are readings, not advice: do not tell anyone a ' +
  'rate is safe or guaranteed. To act, send people to https://escorpio.pro/earn or /borrow, where they sign with their own wallet.'

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
const limit = { type: 'integer', minimum: 1, maximum: 100, description: 'Most rows to return (default 20).' }

export const TOOLS = [
  {
    name: 'get_best_rates',
    title: 'Best USDG rates now',
    description:
      'Headline readings: the best open USDG vault (Morpho, Robinhood Chain), the open vaults by net rate, the cheapest USDG loan per collateral token, and the widest borrow-rate gap for the same collateral and liquidation point.',
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
export async function callTool(name: string, args: Record<string, unknown>, desk: () => Promise<Desk>) {
  const allowed: Record<string, string[]> = {
    get_best_rates: [],
    list_vaults: ['open_only', 'limit'],
    list_markets: ['collateral', 'limit'],
    explain_risk_notes: [],
  }
  if (!(name in allowed)) throw Object.assign(new Error(`Unknown tool: ${name}`), { rpc: -32602 })
  const extra = Object.keys(args).filter((k) => !allowed[name].includes(k))
  if (extra.length) return { isError: true, content: [{ type: 'text', text: `Unknown argument(s) for ${name}: ${extra.join(', ')}` }] }
  if (name === 'explain_risk_notes') return result(riskNotes())

  const d = await desk()
  if (name === 'get_best_rates') return result(rates(d))
  if (name === 'list_vaults') {
    const open = args.open_only === true
    const list = open ? headlineVaults(d) : [...d.vaults].sort((a, b) => b.netApy - a.netApy)
    const n = clamp(args.limit)
    return result({ ...about(d), filter: open ? 'open' : 'all', total: list.length, vaults: list.slice(0, n).map((v) => vaultOut(v, d.readAt)) })
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
export async function handle(msg: Rpc, desk: () => Promise<Desk>): Promise<Out | undefined> {
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
          return ok(id, await callTool(name, args, desk))
        } catch (e) {
          const code = (e as { rpc?: number }).rpc
          if (code) return err(id, code, (e as Error).message)
          return ok(id, { isError: true, content: [{ type: 'text', text: `Could not read the Morpho API right now: ${(e as Error).message}` }] })
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
