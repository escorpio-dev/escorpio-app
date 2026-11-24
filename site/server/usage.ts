// Counts MCP and API calls for /stats in Cloudflare Workers Analytics Engine (binding USAGE, dataset escorpio_usage,
// wrangler.toml). One data point per call: no IP, no user agent, no request body; only what was called.
//   index1 / blob1  kind: "mcp" or "api"
//   blob2           name: the MCP method or tool ("initialize", "tools/list", "tool:get_best_rates"), or the API path
//   blob3           client: the MCP client's own name from initialize (clientInfo.name), otherwise ""
//   blob4           source: "site" when the browser marks the call same-origin (the site reading itself), else "outside"
// writeDataPoint is fire-and-forget and never slows the answer; a missing binding (local dev) records nothing.

export type UsagePoint = { blobs?: string[]; doubles?: number[]; indexes?: string[] }
export type UsageEnv = { USAGE?: { writeDataPoint(p: UsagePoint): void } }
export type Call = { kind: 'mcp' | 'api'; name: string; client?: string; source: 'site' | 'outside' }

export const DATASET = 'escorpio_usage'

const clean = (s: unknown, max = 64) =>
  String(s ?? '')
    .replace(/[^\w .:/@+-]/g, '')
    .trim()
    .slice(0, max)

export function record(env: UsageEnv | undefined, call: Call) {
  try {
    env?.USAGE?.writeDataPoint({
      indexes: [call.kind],
      blobs: [call.kind, clean(call.name) || 'unknown', clean(call.client), call.source],
      doubles: [1],
    })
  } catch {
    // Counting must never break a call.
  }
}

export const sourceOf = (req: Request): Call['source'] => (req.headers.get('sec-fetch-site') === 'same-origin' ? 'site' : 'outside')

// One entry per JSON-RPC message: tool calls by tool name, initialize with the client's name, the rest by method.
export function mcpCalls(msg: unknown): { name: string; client?: string }[] {
  const list = Array.isArray(msg) ? msg : [msg]
  return list.flatMap((m) => {
    if (!m || typeof m !== 'object') return []
    const { method, params } = m as { method?: unknown; params?: Record<string, unknown> }
    if (typeof method !== 'string') return []
    if (method === 'tools/call') return [{ name: `tool:${clean(params?.name, 48) || 'unknown'}` }]
    if (method === 'initialize') {
      const info = (params?.clientInfo ?? {}) as { name?: unknown }
      return [{ name: 'initialize', client: clean(info.name, 48) || 'unnamed' }]
    }
    return [{ name: method }]
  })
}
