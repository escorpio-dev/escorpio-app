// GET /api: what is here. Public, no key, no login. Each reading is at most a minute old.
import { json } from '../../server/api.ts'

export function onRequestGet() {
  return json({
    name: 'Escorpio API',
    about: 'USDG vault and loan readings on Robinhood Chain (chain 4663), read from the public Morpho API at most once a minute.',
    endpoints: {
      '/api/rates': 'best open vault, cheapest loan per collateral, widest rate gap',
      '/api/vaults': 'every USDG vault, best net rate first (?open=1 for open ones only)',
      '/api/markets': 'every USDG loan market, cheapest first (?collateral=<address or symbol>)',
      '/api/desk': 'the Morpho answer the site reads, unchanged, with the read time in the x-escorpio-read-at header',
    },
    mcp: 'https://escorpio.pro/mcp',
    openapi: 'https://escorpio.pro/openapi.json',
    method: 'https://escorpio.pro/method',
    code: 'https://github.com/escorpio-dev/escorpio-app',
    note: 'Readings, not advice. No key, no login, no tracking.',
  })
}
