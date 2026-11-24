// /mcp: Escorpio's MCP endpoint (Streamable HTTP, stateless). POST a JSON-RPC message, get JSON back.
// No sessions and no server-sent stream, so GET answers 405 as the spec allows. Read-only tools, see server/mcp.ts.
import { readDesk, type Ctx } from '../server/api.ts'
import { SUPPORTED_VERSIONS, handle } from '../server/mcp.ts'
import { mcpCalls, record, sourceOf, type UsageEnv } from '../server/usage.ts'

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id, authorization',
  'access-control-expose-headers': 'mcp-protocol-version',
}
const JSON_HEADERS = { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }
const MAX_BODY = 64 * 1024

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
const rpcError = (code: number, message: string, status = 400) => reply({ jsonrpc: '2.0', id: null, error: { code, message } }, status)

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS })
}

// A browser opening /mcp gets a short pointer instead of a bare 405 body.
export function onRequestGet() {
  return new Response(
    'Escorpio MCP server (Streamable HTTP). Add https://escorpio.pro/mcp as a connector in your MCP client. POST JSON-RPC only.\n',
    { status: 405, headers: { ...CORS, allow: 'POST, OPTIONS', 'content-type': 'text/plain; charset=utf-8' } },
  )
}

export async function onRequestPost(ctx: Ctx & { env?: UsageEnv }) {
  const version = ctx.request.headers.get('mcp-protocol-version')
  if (version && !SUPPORTED_VERSIONS.includes(version)) return rpcError(-32600, `Unsupported MCP-Protocol-Version: ${version}`)
  const text = await ctx.request.text()
  if (text.length > MAX_BODY) return rpcError(-32600, 'Request too large', 413)
  let msg: unknown
  try {
    msg = JSON.parse(text)
  } catch {
    return rpcError(-32700, 'Parse error')
  }
  const source = sourceOf(ctx.request)
  for (const c of mcpCalls(msg)) record(ctx.env, { kind: 'mcp', ...c, source })
  const desk = () => readDesk(ctx)
  if (Array.isArray(msg)) {
    if (!msg.length || msg.length > 20) return rpcError(-32600, 'Invalid batch')
    const out = (await Promise.all(msg.map((m) => handle(m, desk)))).filter(Boolean)
    return out.length ? reply(out) : new Response(null, { status: 202, headers: CORS })
  }
  const out = await handle(msg as never, desk)
  return out ? reply(out) : new Response(null, { status: 202, headers: CORS })
}
