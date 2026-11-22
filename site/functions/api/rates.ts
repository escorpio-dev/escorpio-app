// GET /api/rates: the headline readings (best open vault, cheapest loan per collateral, widest rate gap).
import { failed, json, rates, readDesk, type Ctx } from '../../server/api.ts'

export async function onRequestGet(ctx: Ctx) {
  try {
    return json(rates(await readDesk(ctx)))
  } catch (e) {
    return failed(e)
  }
}
