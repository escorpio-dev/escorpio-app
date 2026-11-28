// GET /api/vaults: every Morpho vault on Robinhood Chain that holds real USDG, best net rate first.
// ?open=1 keeps only the vaults Escorpio would put in the headline (listed, open, $50k+, no stop note).
import { headlineVaults } from '../../src/data/desk.ts'
import { about, failed, json, readDesk, vaultOut, type Ctx } from '../../server/api.ts'

export async function onRequestGet(ctx: Ctx) {
  try {
    const d = await readDesk(ctx)
    const open = new URL(ctx.request.url).searchParams.get('open') === '1'
    const list = open ? headlineVaults(d) : [...d.vaults].sort((a, b) => b.netApy - a.netApy)
    return json({ ...about(d), filter: open ? 'open' : 'all', count: list.length, vaults: list.map((v) => vaultOut(v, d.readAt, d.chain)) })
  } catch (e) {
    return failed(e)
  }
}
