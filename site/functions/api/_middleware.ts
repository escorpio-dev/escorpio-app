// Counts every GET under /api for /stats (server/usage.ts). Runs only for /api routes, never for static files.
import { record, sourceOf, type UsageEnv } from '../../server/usage.ts'

type Ctx = { request: Request; env: UsageEnv; next(): Promise<Response> }

export async function onRequest(ctx: Ctx) {
  const res = await ctx.next()
  if (ctx.request.method === 'GET') record(ctx.env, { kind: 'api', name: new URL(ctx.request.url).pathname, source: sourceOf(ctx.request) })
  return res
}
