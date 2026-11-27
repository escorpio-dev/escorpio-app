import { isAddress, type Address, type Hex } from 'viem'
import type { LoanMode } from './loan-tx.ts'
import type { VaultMode } from './vault-tx.ts'

// Links that open an Escorpio page already filled in: a vault deposit or withdrawal on /earn, a loan action on
// /borrow, a payment request on /receive. The MCP server (server/agent.ts) builds them for AI agents; the pages read
// them back. A link only fills in the form. The page still reads the wallet, shows every step in plain words,
// simulates it and waits for the wallet owner to sign, so a link from anyone can never move money by itself.

export const SITE = 'https://escorpio.pro'
const AMOUNT = /^\d{1,15}(\.\d{1,18})?$/ // plain decimal text, as typed into the form
export const isAmount = (s: string) => AMOUNT.test(s)
const amountOrAll = (s: string | null) => (s === 'all' || (s && isAmount(s)) ? s : undefined)

export type VaultLink = { vault: Address; action: VaultMode; amount: string } // amount: decimal USDG or "all" (withdraw)
export type LoanLink = { market: Hex; action: LoanMode; collateral?: string; usdg?: string } // usdg "all" = repay all
export type ReceiveLink = { amount: string; memo?: string; days?: 0 | 7 | 30 }

export function vaultLink(l: VaultLink, origin = SITE) {
  return `${origin}/earn?${new URLSearchParams({ vault: l.vault, action: l.action, amount: l.amount })}`
}
export function readVaultLink(search: string): VaultLink | undefined {
  const q = new URLSearchParams(search)
  const vault = q.get('vault') ?? ''
  const action = q.get('action')
  const amount = amountOrAll(q.get('amount'))
  if (!isAddress(vault) || (action !== 'deposit' && action !== 'withdraw') || !amount) return undefined
  if (amount === 'all' && action !== 'withdraw') return undefined
  return { vault, action, amount }
}

export function loanLink(l: LoanLink, origin = SITE) {
  const q = new URLSearchParams({ market: l.market, action: l.action })
  if (l.collateral) q.set('collateral', l.collateral)
  if (l.usdg) q.set('usdg', l.usdg)
  return `${origin}/borrow?${q}`
}
export function readLoanLink(search: string): LoanLink | undefined {
  const q = new URLSearchParams(search)
  const market = q.get('market') ?? ''
  const action = q.get('action')
  const collateral = q.get('collateral') ?? undefined
  const usdg = q.get('usdg') ?? undefined
  if (!/^0x[0-9a-fA-F]{64}$/.test(market)) return undefined
  if (action !== 'borrow' && action !== 'repay' && action !== 'collateral') return undefined
  if (collateral !== undefined && !isAmount(collateral)) return undefined
  if (usdg !== undefined && !(isAmount(usdg) || (usdg === 'all' && action === 'repay'))) return undefined
  return { market: market as Hex, action, collateral, usdg }
}

export function receiveLink(l: ReceiveLink, origin = SITE) {
  const q = new URLSearchParams({ amount: l.amount })
  if (l.memo) q.set('memo', l.memo)
  if (l.days !== undefined) q.set('days', String(l.days))
  return `${origin}/receive?${q}`
}
export function readReceiveLink(search: string): ReceiveLink | undefined {
  const q = new URLSearchParams(search)
  const amount = q.get('amount') ?? ''
  if (!isAmount(amount)) return undefined
  const d = Number(q.get('days') ?? 30)
  const days = d === 0 || d === 7 || d === 30 ? d : 30
  return { amount, memo: (q.get('memo') ?? '').slice(0, 120) || undefined, days }
}
