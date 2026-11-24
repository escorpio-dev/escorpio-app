import { isAddress } from 'viem'
import { EXPLORER } from '@/data/morpho'

// $ESCORPIO (launch-kit/LAUNCH.md, "Token utility plan"). Empty until launch day, and while it is empty nothing about the
// token shows anywhere on the site: no hero CA, no home section, no /token page, no nav link, no "Holders first" labels.
// Launch day: paste the CA in TOKEN_ADDRESS and the holder threshold in whole tokens in HOLDER_MIN. HOLDER_MIN must be
// the same threshold as HOLDER_MIN in alerts/wrangler.toml, which is in raw units (this number × 10^18).
export const TOKEN_ADDRESS: string = ''
export const HOLDER_MIN: number = 5_000_000

export const TOKEN_LIVE = isAddress(TOKEN_ADDRESS) && HOLDER_MIN > 0

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export const tokenLinks = (a: string): [string, string][] => [
  ['Blockscout', `${EXPLORER}/token/${a}`],
  ['GeckoTerminal', `https://www.geckoterminal.com/robinhood/tokens/${a}`],
  ['DexScreener', `https://dexscreener.com/robinhood/${a}`],
  ['Pons', `https://ponsfamily.com/launchpad/${a}`],
]

// What holding changes. Only what is switched on, in the same words as the alerts Worker (alerts/src/logic.ts LIMITS).
// No API or MCP limits: the API has none today, so "higher limits" would only take something away from free users.
export const PERKS: [string, string, string][] = [
  ['Rate alerts on Telegram', '2, checked every 15 minutes', '10, checked every minute'],
  ['Daily digest on Telegram', 'no', 'every day, 00:05 UTC'],
  ['New features (Receive, Pay out)', 'when they go live', 'first, as betas, when they ship'],
  ['The desk: rates, deposits, loans, API, MCP', 'free, no sign-up', 'the same'],
]
