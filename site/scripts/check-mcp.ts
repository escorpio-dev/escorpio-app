// Checks the MCP server logic (server/mcp.ts) without a network server: the handshake, the tool list, every tool on a
// live Morpho read, and the error paths a client can hit. Run: npm run check:mcp
import assert from 'node:assert/strict'
import { fetchMorpho, parseDesk } from '../src/data/morpho.ts'
import { TOOLS, handle } from '../server/mcp.ts'

const live = parseDesk(await fetchMorpho(), Date.now())
const desk = async () => live
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const call = (method: string, params: Record<string, unknown> = {}, id: number | undefined = 1): Promise<any> =>
  handle({ jsonrpc: '2.0', id, method, params }, desk)

const init = await call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '0' } })
assert.equal(init.result.protocolVersion, '2025-06-18')
assert.equal(init.result.serverInfo.name, 'escorpio')
assert.ok(init.result.capabilities.tools)
assert.equal((await call('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion, '2025-06-18')
assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, desk), undefined)

const list = await call('tools/list')
assert.deepEqual(list.result.tools.map((t: { name: string }) => t.name), TOOLS.map((t) => t.name))
for (const t of list.result.tools) assert.equal(t.annotations.readOnlyHint, true, t.name)

const best = (await call('tools/call', { name: 'get_best_rates', arguments: {} })).result
assert.ok(!best.isError)
assert.ok(best.structuredContent.readAt && best.structuredContent.bestOpenVault, 'best open vault')
assert.equal(JSON.parse(best.content[0].text).readAt, best.structuredContent.readAt)

const vaults = (await call('tools/call', { name: 'list_vaults', arguments: { open_only: true, limit: 2 } })).result.structuredContent
assert.ok(vaults.vaults.length <= 2 && vaults.total >= vaults.vaults.length)

const nvda = (await call('tools/call', { name: 'list_markets', arguments: { collateral: 'NVDA', limit: 50 } })).result.structuredContent
assert.ok(nvda.markets.length > 0, 'NVDA markets')
for (let i = 1; i < nvda.markets.length; i++) assert.ok(nvda.markets[i].borrowApyPct >= nvda.markets[i - 1].borrowApyPct, 'cheapest first')

const notes = (await call('tools/call', { name: 'explain_risk_notes' })).result.structuredContent
assert.ok(notes.fromMorpho.some((n: { stop: boolean }) => n.stop) && notes.fromEscorpio.length > 5)

// Error paths.
assert.equal((await call('tools/call', { name: 'send_money', arguments: {} })).error.code, -32602)
assert.equal((await call('tools/call', { name: 'list_vaults', arguments: { amount: 5 } })).result.isError, true)
assert.equal((await call('nope')).error.code, -32601)
assert.equal((await handle({ id: 1 } as never, desk))!.error!.code, -32600)

console.log(`mcp: ${list.result.tools.length} tools ok; best open vault ${best.structuredContent.bestOpenVault.name}, ${nvda.total} NVDA markets`)
