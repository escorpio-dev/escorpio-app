// GET /api/markets: every Morpho market lending USDG on Robinhood Chain, cheapest borrow rate first.
// ?collateral=<address or symbol> keeps one collateral. Look-alike tokens can share a symbol, so prefer the address.
import { about, failed, json, marketOut, readDesk, type Ctx } from '../../server/api.ts'

export async function onRequestGet(ctx: Ctx) {
  try {
    const d = await readDesk(ctx)
    const q = (new URL(ctx.request.url).searchParams.get('collateral') ?? '').trim().toLowerCase().slice(0, 64)
    const list = d.markets
      .filter((m) => !q || m.collateral.address.toLowerCase() === q || m.collateral.symbol.toLowerCase() === q)
      .sort((a, b) => a.borrowApy - b.borrowApy)
    return json({ ...about(d), filter: q ? { collateral: q } : 'all', count: list.length, markets: list.map((m) => marketOut(m, d.readAt)) })
  } catch (e) {
    return failed(e)
  }
}
