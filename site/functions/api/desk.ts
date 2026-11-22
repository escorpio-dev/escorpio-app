// GET /api/desk: Morpho's own answer, byte for byte, exactly what the site reads. The read time is in a header and
// the query is public in src/data/morpho.ts, so anyone can ask Morpho the same question and compare.
import { READ_AT_HEADER } from '../../src/data/morpho.ts'
import { failed, readMorpho, type Ctx } from '../../server/api.ts'

export async function onRequestGet(ctx: Ctx) {
  try {
    const r = await readMorpho(ctx)
    return new Response(r.body, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': '*',
        'access-control-expose-headers': READ_AT_HEADER,
        'cache-control': 'public, max-age=30',
        'x-content-type-options': 'nosniff',
        [READ_AT_HEADER]: String(r.readAt),
      },
    })
  } catch (e) {
    return failed(e)
  }
}
