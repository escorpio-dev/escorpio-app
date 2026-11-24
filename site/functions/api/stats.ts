// GET /api/stats: escorpio.pro traffic per UTC day since launch, as Cloudflare counts it (server/stats.ts).
// Needs CF_ANALYTICS_TOKEN, a Cloudflare API token with only Zone > Analytics > Read on escorpio.pro, set by the owner
// as a Pages secret. Without it the endpoint says so instead of guessing.
import { readTraffic } from '../../server/stats.ts'

type Ctx = { env: { CF_ANALYTICS_TOKEN?: string }; waitUntil(p: Promise<unknown>): void }

const headers = (cache: string) => ({
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'cache-control': cache,
  'x-content-type-options': 'nosniff',
})

export async function onRequestGet(ctx: Ctx) {
  const token = ctx.env.CF_ANALYTICS_TOKEN
  if (!token)
    return new Response(JSON.stringify({ error: 'Traffic numbers are not connected yet' }) + '\n', { status: 503, headers: headers('no-store') })
  try {
    return new Response(await readTraffic(ctx, token), { headers: headers('public, max-age=300') })
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Could not read Cloudflare analytics right now', detail: e instanceof Error ? e.message : String(e) }) + '\n',
      { status: 502, headers: headers('no-store') },
    )
  }
}
