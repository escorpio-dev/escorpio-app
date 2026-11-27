// Agent tools for the MCP server: an AI agent prepares a deposit, withdrawal, loan action or payment request, and the
// wallet owner signs it on escorpio.pro. Nothing here can sign, send or hold anything. Each tool checks the request
// against the same readings and rules as the site, and with a wallet address it reads that wallet and simulates the
// whole plan on chain (eth_call, no transaction), using the same plan functions as the site's dialogs. The answer
// carries a link that opens the page filled in; the page reads the wallet again, simulates again and waits for the
// owner's signature. The wallet address is used for the reads and is not stored or counted (server/usage.ts).
import { isAddress, isHash, type Address, type Hash, type Hex, type PublicClient } from 'viem'
import { marketNotes, vaultNotes } from '../src/data/desk.ts'
import type { Desk } from '../src/data/morpho.ts'
import { isAmount, loanLink, receiveLink, vaultLink } from '../src/lib/action-link.ts'
import { publicClient } from '../src/lib/chain.ts'
import { liquidationPrice, loanAfter, loanBlock, loanCapRoom, loanPlan, readLoan, simulateLoanPlan, type LoanMode } from '../src/lib/loan-tx.ts'
import { MEMO_MAX, expired, fromQuery, matches, readReceipt, verifyRequest } from '../src/lib/receive.ts'
import { showUnits, toUnits } from '../src/lib/units.ts'
import { USDG_DECIMALS, readPosition, simulateVaultPlan, vaultBlock, vaultSteps, type VaultMode } from '../src/lib/vault-tx.ts'
import { about, marketOut, vaultOut } from './api.ts'

type Args = Record<string, unknown>
export type ToolOut = { isError?: boolean; content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown> }

const U = (v: bigint) => showUnits(v, USDG_DECIMALS)
const fail = (text: string): ToolOut => ({ isError: true, content: [{ type: 'text', text }] })
const done = (data: Record<string, unknown>): ToolOut => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data })
const SIGN =
  'Give open_url to the wallet owner. It opens escorpio.pro with this filled in; the page reads the wallet again, shows every step in plain words, simulates it, and only the owner can sign, in their own wallet. Escorpio and this tool cannot sign or send anything.'

// The public Robinhood Chain RPC refuses most eth_call traffic from Cloudflare's servers ("Too Many Requests"), while
// the same calls from a person's browser pass. So a chain read here may fail: the tool then still returns the link and
// says plainly that it was not simulated here. The page always reads the wallet and simulates in the browser anyway.
const NO_CHAIN =
  "Escorpio's server could not read Robinhood Chain just now, so this was not checked against the wallet or simulated here. The page at open_url reads the wallet and simulates every step in the browser before anything can be signed."
const chainError = (e: unknown) => {
  const x = e as { details?: string; shortMessage?: string; message?: string }
  return String(x.details ?? x.shortMessage ?? x.message ?? e).slice(0, 160)
}
// A simulation that failed because the RPC did not answer (viem's plain-sentence errors), not because the plan is wrong.
const chainDidNotAnswer = (why: string) => /too many requests|rate limit|429|request failed|fetch failed|timed out|took too long/i.test(why)
const withoutChain = (out: Record<string, unknown>, e: unknown, summary: string): ToolOut =>
  done({ ...out, simulation: { passed: null, why: NO_CHAIN }, chainError: chainError(e), summary: `${summary} Not simulated by Escorpio's server (Robinhood Chain RPC did not answer); the page simulates before signing.` })

const PREPARE = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
const wallet = { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', description: 'Optional. The wallet that will sign. With it the tool reads its balances and simulates the whole plan on chain (no transaction). Not stored.' }
const usdgAmount = (d: string) => ({ type: 'string', pattern: '^\\d{1,15}(\\.\\d{1,6})?$', description: d })

export const AGENT_TOOLS = [
  {
    name: 'prepare_deposit',
    title: 'Prepare a USDG vault deposit',
    description:
      'Prepares a deposit of USDG into one Morpho vault on Robinhood Chain for the wallet owner to sign on escorpio.pro. Pick the vault with list_vaults or get_best_rates first and tell the person its rate, size and notes. Refused for a vault with a stop note. With wallet: balances, the signatures needed (an exact-amount approval, then the deposit) and an on-chain simulation.',
    inputSchema: {
      type: 'object',
      properties: { vault: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', description: 'Vault address from list_vaults.' }, amount_usdg: usdgAmount('USDG to deposit, for example "250" or "99.5".'), wallet },
      required: ['vault', 'amount_usdg'],
      additionalProperties: false,
    },
    annotations: { title: 'Prepare a USDG vault deposit', ...PREPARE },
  },
  {
    name: 'prepare_withdraw',
    title: 'Prepare a vault withdrawal',
    description: 'Prepares a withdrawal of USDG from one Morpho vault back to the wallet, for the owner to sign on escorpio.pro. amount_usdg "all" takes everything out. With wallet: what is in the vault and an on-chain simulation.',
    inputSchema: {
      type: 'object',
      properties: { vault: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', description: 'Vault address.' }, amount_usdg: { type: 'string', pattern: '^(all|\\d{1,15}(\\.\\d{1,6})?)$', description: 'USDG to withdraw, or "all".' }, wallet },
      required: ['vault', 'amount_usdg'],
      additionalProperties: false,
    },
    annotations: { title: 'Prepare a vault withdrawal', ...PREPARE },
  },
  {
    name: 'prepare_borrow',
    title: 'Prepare a USDG loan',
    description:
      'Prepares putting collateral into one Morpho market and/or borrowing USDG against it, for the owner to sign on escorpio.pro. Pick the market with list_markets (by collateral) first and tell the person the rate and the liquidation point. Escorpio refuses a loan past 90% of the liquidation line and new loans in a market with a stop note. With wallet: the loan after this action, its liquidation price, the signatures needed and an on-chain simulation.',
    inputSchema: {
      type: 'object',
      properties: {
        market_id: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$', description: 'Market id from list_markets.' },
        collateral_amount: { type: 'string', pattern: '^\\d{1,15}(\\.\\d{1,18})?$', description: 'Collateral tokens to put in, in whole tokens (for example "2.5" NVDA). Omit to borrow against collateral already in.' },
        borrow_usdg: usdgAmount('USDG to borrow. Omit to only put collateral in.'),
        wallet,
      },
      required: ['market_id'],
      additionalProperties: false,
    },
    annotations: { title: 'Prepare a USDG loan', ...PREPARE },
  },
  {
    name: 'prepare_repay',
    title: 'Prepare a loan repayment',
    description: 'Prepares repaying USDG debt in one Morpho market, for the owner to sign on escorpio.pro. amount_usdg "all" repays the whole loan. With wallet: the debt now, the signatures needed and an on-chain simulation.',
    inputSchema: {
      type: 'object',
      properties: { market_id: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$', description: 'Market id.' }, amount_usdg: { type: 'string', pattern: '^(all|\\d{1,15}(\\.\\d{1,6})?)$', description: 'USDG to repay, or "all".' }, wallet },
      required: ['market_id', 'amount_usdg'],
      additionalProperties: false,
    },
    annotations: { title: 'Prepare a loan repayment', ...PREPARE },
  },
  {
    name: 'prepare_collateral_withdraw',
    title: 'Prepare taking collateral back',
    description: 'Prepares taking collateral back out of one Morpho market to the wallet, for the owner to sign on escorpio.pro. Refused when it would put the loan past 90% of the liquidation line. With wallet: an on-chain simulation.',
    inputSchema: {
      type: 'object',
      properties: { market_id: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$', description: 'Market id.' }, collateral_amount: { type: 'string', pattern: '^\\d{1,15}(\\.\\d{1,18})?$', description: 'Collateral tokens to take back, in whole tokens.' }, wallet },
      required: ['market_id', 'collateral_amount'],
      additionalProperties: false,
    },
    annotations: { title: 'Prepare taking collateral back', ...PREPARE },
  },
  {
    name: 'prepare_payment_request',
    title: 'Prepare a USDG payment request',
    description:
      'Prepares a USDG payment request (an invoice link) on escorpio.pro/receive. The person who should be paid opens open_url with that wallet and signs the request (a free signature, not a transaction); the page then gives them a link to send to whoever pays. The payer pays from their own wallet straight to the payee.',
    inputSchema: {
      type: 'object',
      properties: {
        amount_usdg: usdgAmount('USDG to ask for.'),
        memo: { type: 'string', maxLength: MEMO_MAX, description: 'What it is for, shown to the payer. Optional.' },
        valid_days: { type: 'integer', enum: [0, 7, 30], description: 'How long the link works: 7, 30 (default) or 0 for no end date.' },
      },
      required: ['amount_usdg'],
      additionalProperties: false,
    },
    annotations: { title: 'Prepare a USDG payment request', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: 'check_payment',
    title: 'Check a USDG payment',
    description:
      'Reads a transaction from Robinhood Chain: status, time, sender and every USDG transfer in it. With the payment link (escorpio.pro/pay?…), also says whether the payee really signed that request and whether this transaction paid it (payee, exact amount, reference).',
    inputSchema: {
      type: 'object',
      properties: {
        tx_hash: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$', description: 'Transaction hash of the payment.' },
        payment_link: { type: 'string', maxLength: 2048, description: 'Optional. The escorpio.pro/pay link that was paid.' },
      },
      required: ['tx_hash'],
      additionalProperties: false,
    },
    annotations: { title: 'Check a USDG payment', ...PREPARE },
  },
]

export const AGENT_ARGS: Record<string, string[]> = Object.fromEntries(AGENT_TOOLS.map((t) => [t.name, Object.keys(t.inputSchema.properties)]))

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const usdgOk = (s: string) => /^\d{1,15}(\.\d{1,6})?$/.test(s)

function readWallet(args: Args): { ok: true; wallet?: Address } | { ok: false; why: string } {
  if (args.wallet === undefined) return { ok: true }
  const w = str(args.wallet)
  return isAddress(w) ? { ok: true, wallet: w } : { ok: false, why: 'wallet must be a 0x address (40 hex characters).' }
}

async function vaultTool(name: 'prepare_deposit' | 'prepare_withdraw', args: Args, d: Desk, pc: PublicClient): Promise<ToolOut> {
  const mode: VaultMode = name === 'prepare_deposit' ? 'deposit' : 'withdraw'
  const address = str(args.vault)
  const raw = str(args.amount_usdg)
  const w = readWallet(args)
  if (!w.ok) return fail(w.why)
  const vault = d.vaults.find((v) => v.address.toLowerCase() === address.toLowerCase())
  if (!vault) return fail(`${address || 'That address'} is not a USDG vault Escorpio reads on Robinhood Chain. Use list_vaults for the addresses.`)
  if (!(usdgOk(raw) || (mode === 'withdraw' && raw === 'all'))) return fail('amount_usdg must be a USDG amount with at most 6 decimals, like "250" or "99.5"' + (mode === 'withdraw' ? ', or "all".' : '.'))
  const notes = vaultNotes(vault, d.readAt)
  if (mode === 'deposit' && notes.some((n) => n.stop))
    return fail(`Escorpio does not offer deposits into ${vault.name} right now: ${notes.filter((n) => n.stop).map((n) => n.text).join('; ')}.`)
  const all = raw === 'all'
  const out: Record<string, unknown> = {
    ...about(d),
    action: mode,
    open_url: vaultLink({ vault: vault.address as Address, action: mode, amount: raw }),
    signing: SIGN,
    vault: vaultOut(vault, d.readAt),
  }
  if (!all && toUnits(raw, USDG_DECIMALS) === 0n) return fail('amount_usdg must be more than 0.')
  const plain = `${mode === 'deposit' ? 'Deposit' : 'Withdraw'} ${all ? 'everything' : `${raw} USDG`} ${mode === 'deposit' ? 'into' : 'from'} ${vault.name}.`
  if (!w.wallet) return done({ ...out, summary: `${plain} Pass wallet to see the steps and simulate it.` })
  let pos
  try {
    pos = await readPosition(pc, w.wallet, vault.address as Address)
  } catch (e) {
    return withoutChain(out, e, plain)
  }
  const amount = all ? pos.inVault : toUnits(raw, USDG_DECIMALS)
  out.wallet = { address: w.wallet, usdg: U(pos.usdg), inThisVault: U(pos.inVault), hasEthForFees: pos.eth > 0n }
  if (all && amount === 0n) return done({ ...out, blocked: 'This wallet has nothing in this vault.', summary: 'Nothing to withdraw.' })
  const block = vaultBlock(mode, amount, pos)
  if (block) return done({ ...out, blocked: block, summary: `Cannot ${mode} ${U(amount)} USDG: ${block}` })
  const sim = await simulateVaultPlan(pc, w.wallet, vault.address as Address, mode, amount, pos)
  if (!sim.ok && chainDidNotAnswer(sim.why)) return withoutChain(out, sim.why, plain)
  const steps = vaultSteps(mode, amount, pos).map((s) => s.label)
  out.steps = steps
  out.simulation = sim.ok
    ? { passed: true, result: mode === 'deposit' ? `${sim.out} vault shares (18 decimals)` : `${U(sim.out)} USDG back to the wallet` }
    : { passed: false, why: sim.why }
  out.summary =
    mode === 'deposit'
      ? `The wallet sends ${U(amount)} USDG straight to ${vault.name} and gets vault shares. ${steps.length} signature${steps.length > 1 ? 's' : ''}. Simulation ${sim.ok ? 'passed' : `failed: ${sim.why}`}.`
      : `${vault.name} sends ${U(amount)} USDG back to the wallet. One signature. Simulation ${sim.ok ? 'passed' : `failed: ${sim.why}`}.`
  return done(out)
}

async function loanTool(name: 'prepare_borrow' | 'prepare_repay' | 'prepare_collateral_withdraw', args: Args, d: Desk, pc: PublicClient): Promise<ToolOut> {
  const mode: LoanMode = name === 'prepare_borrow' ? 'borrow' : name === 'prepare_repay' ? 'repay' : 'collateral'
  const id = str(args.market_id).toLowerCase()
  const w = readWallet(args)
  if (!w.ok) return fail(w.why)
  const market = d.markets.find((m) => m.id.toLowerCase() === id)
  if (!market) return fail(`${id || 'That id'} is not a USDG loan market Escorpio reads on Robinhood Chain. Use list_markets for the ids.`)
  const rawColl = str(args.collateral_amount)
  const rawUsdg = str(mode === 'borrow' ? args.borrow_usdg : args.amount_usdg)
  if (rawColl && !isAmount(rawColl)) return fail('collateral_amount must be a plain number of tokens, like "2.5".')
  if (rawUsdg && !(usdgOk(rawUsdg) || (mode === 'repay' && rawUsdg === 'all'))) return fail('The USDG amount must have at most 6 decimals, like "500"' + (mode === 'repay' ? ', or "all".' : '.'))
  if (mode === 'borrow' && !rawColl && !rawUsdg) return fail('Give collateral_amount, borrow_usdg or both.')
  const notes = marketNotes(market, d.readAt)
  if (mode === 'borrow' && notes.some((n) => n.stop))
    return fail(`Escorpio does not offer new loans in this market right now: ${notes.filter((n) => n.stop).map((n) => n.text).join('; ')}. Repaying and taking collateral back still work.`)

  if (rawColl && !/[1-9]/.test(rawColl)) return fail('collateral_amount must be more than 0.')
  if (rawUsdg && rawUsdg !== 'all' && toUnits(rawUsdg, USDG_DECIMALS) === 0n) return fail('The USDG amount must be more than 0.')
  const symbol = market.collateral.symbol
  const out: Record<string, unknown> = {
    ...about(d),
    action: mode === 'collateral' ? 'collateral_withdraw' : mode,
    open_url: loanLink({ market: market.id as Hex, action: mode, collateral: rawColl || undefined, usdg: rawUsdg || undefined }),
    signing: SIGN,
    market: marketOut(market, d.readAt),
    escorpioLimit: 'Escorpio stops a loan at 90% of the liquidation line and warns from 80%.',
  }
  // The action in a few words, for the summary: "put in 2 NVDA and borrow 500 USDG".
  let what: string
  if (mode === 'borrow') what = [rawColl && `put in ${rawColl} ${symbol}`, rawUsdg && `borrow ${rawUsdg} USDG`].filter(Boolean).join(' and ')
  else if (mode === 'repay') what = rawUsdg === 'all' ? 'repay the whole loan' : `repay ${rawUsdg} USDG`
  else what = `take back ${rawColl} ${symbol}`
  const What = what[0].toUpperCase() + what.slice(1)
  const plain = `${What} on the ${symbol} market.`
  if (!w.wallet) return done({ ...out, summary: `${plain} Pass wallet to check the loan limit, see the steps and simulate it.` })

  // The wallet's loan, the market's parameters, token decimals and oracle price come from the chain.
  let loan
  try {
    loan = await readLoan(pc, w.wallet, market.id as Hex)
  } catch (e) {
    return withoutChain(out, e, plain)
  }
  const coll = rawColl ? toUnits(rawColl, loan.collDecimals) : 0n
  const usdgAmt = rawUsdg === 'all' ? loan.debt : rawUsdg ? toUnits(rawUsdg, USDG_DECIMALS) : 0n
  const C = (v: bigint) => showUnits(v, loan.collDecimals, 2)
  const after = loanAfter(loan, mode, coll, usdgAmt)
  out.wallet = {
    address: w.wallet,
    usdg: U(loan.walletUsdg),
    collateralInWallet: `${C(loan.walletColl)} ${loan.collSymbol}`,
    hasEthForFees: loan.eth > 0n,
    loanNow: { collateral: `${C(loan.collateral)} ${loan.collSymbol}`, debtUsdg: U(loan.debt) },
    loanAfter: {
      collateral: `${C(after.collateral)} ${loan.collSymbol}`,
      debtUsdg: U(after.debt),
      liquidationLinePctUsed: Number.isFinite(after.used) ? after.used : null,
      liquidationPriceUsdg: after.debt > 0n ? Math.round(liquidationPrice(after.debt, after.collateral, loan.params.lltv, loan.collDecimals) * 100) / 100 : null,
      stillBorrowableAtEscorpioLimitUsdg: U(loanCapRoom(loan, after)),
    },
  }
  if (mode === 'repay' && rawUsdg === 'all' && loan.debt === 0n) return done({ ...out, blocked: 'This wallet owes nothing in this market.', summary: 'Nothing to repay.' })
  const block = loanBlock(loan, mode, coll, usdgAmt)
  if (block) return done({ ...out, blocked: block, summary: `Cannot ${what}: ${block}` })
  const plan = loanPlan(loan, mode, coll, usdgAmt)
  const sim = await simulateLoanPlan(pc, w.wallet, market.id as Hex, loan, mode, coll, usdgAmt)
  if (!sim.ok && chainDidNotAnswer(sim.why)) return withoutChain(out, sim.why, plain)
  out.steps = plan.steps.map((s) => s.label)
  out.simulation = sim.ok ? { passed: true, result: sim.note } : { passed: false, why: sim.why }
  out.summary = `${What} on the ${loan.collSymbol} market: ${plan.steps.length} signature${plan.steps.length > 1 ? 's' : ''}. Simulation ${sim.ok ? `passed: ${sim.note}` : `failed: ${sim.why}`}`
  return done(out)
}

function paymentRequestTool(args: Args): ToolOut {
  const raw = str(args.amount_usdg)
  if (!usdgOk(raw) || toUnits(raw, USDG_DECIMALS) === 0n) return fail('amount_usdg must be a USDG amount above 0 with at most 6 decimals, like "100".')
  const memo = typeof args.memo === 'string' ? args.memo.replace(/\s+/g, ' ').trim() : ''
  if (memo.length > MEMO_MAX) return fail(`memo is at most ${MEMO_MAX} characters.`)
  const days = args.valid_days === undefined ? 30 : args.valid_days
  if (days !== 0 && days !== 7 && days !== 30) return fail('valid_days is 0, 7 or 30.')
  return done({
    action: 'payment_request',
    open_url: receiveLink({ amount: raw, memo: memo || undefined, days }),
    summary: `A request for ${raw} USDG${memo ? ` for "${memo}"` : ''}, ${days ? `valid for ${days} days` : 'with no end date'}.`,
    signing:
      'Give open_url to the person who should be paid. They open it with the wallet that should receive the USDG and sign the request there (a free signature, not a transaction). The page then shows the payment link to send to the payer. Anyone with that link sees the amount, the memo and the payee address.',
  })
}

async function checkPaymentTool(args: Args, pc: PublicClient): Promise<ToolOut> {
  const hash = str(args.tx_hash)
  if (!isHash(hash)) return fail('tx_hash must be a 0x transaction hash (64 hex characters).')
  let req
  let search = '' // the payment link's query, carried into the receipt link
  if (args.payment_link !== undefined) {
    try {
      search = new URL(str(args.payment_link)).search
    } catch {
      return fail('payment_link must be the full escorpio.pro/pay?… link.')
    }
    const parsed = fromQuery(search)
    if (!parsed.ok) return fail(`The payment link does not work: ${parsed.why}`)
    req = parsed.req
  }
  const receiptUrl = `https://escorpio.pro/receipt?tx=${hash}${search ? `&${search.slice(1)}` : ''}`
  let rc
  try {
    rc = await readReceipt(pc, hash as Hash)
  } catch (e) {
    return done({ tx_hash: hash, found: null, chainError: chainError(e), receipt_url: receiptUrl, summary: "Escorpio's server could not read Robinhood Chain just now. Open receipt_url: the receipt page reads the payment in the browser." })
  }
  if (!rc) return done({ tx_hash: hash, found: false, summary: 'Robinhood Chain has no transaction with this hash yet. A payment sent seconds ago can take a moment; check again.', receipt_url: receiptUrl })
  const out: Record<string, unknown> = {
    tx_hash: hash,
    found: true,
    succeeded: rc.ok,
    time: new Date(rc.time * 1000).toISOString(),
    block: rc.block.toString(),
    from: rc.from,
    usdgTransfers: rc.transfers.map((t) => ({ from: t.from, to: t.to, usdg: U(t.value) })),
    referenceInTx: rc.ref ?? null,
    receipt_url: receiptUrl,
  }
  if (!req) {
    out.summary = rc.ok ? `Succeeded. ${rc.transfers.length} USDG transfer(s) in it.` : 'This transaction failed on chain; nothing moved.'
    return done(out)
  }
  // A plain wallet's signature is checked without the chain; only a smart-wallet check can fail on an outage.
  const signed = await verifyRequest(pc, req).catch(() => null)
  const m = matches(rc, req)
  out.request = { payee: req.to, usdg: U(req.amount), memo: req.memo || null, reference: req.ref, signedByPayee: signed, expired: expired(req, Math.floor(Date.now() / 1000)) }
  out.paid = signed === null ? null : signed && m.paid
  out.referenceMatches = m.refMatch
  out.summary = signed === null
    ? "Escorpio's server could not check the payee's signature just now (Robinhood Chain did not answer). Open receipt_url to check it in the browser."
    : !signed
    ? 'The payment link is not signed by the payee, so it proves nothing about what was asked.'
    : m.paid
      ? `Paid: ${U(req.amount)} USDG reached ${req.to}${m.refMatch ? ', and the reference matches this request.' : '. The reference in the transaction does not match this request (it may have been paid outside the pay page).'}`
      : `Not paid by this transaction: no ${U(req.amount)} USDG transfer to ${req.to} in it.`
  return done(out)
}

/** Runs one agent tool. The client is injectable so checks can use their own. */
export async function callAgentTool(name: string, args: Args, desk: () => Promise<Desk>, pc: PublicClient = publicClient): Promise<ToolOut> {
  if (name === 'prepare_payment_request') return paymentRequestTool(args)
  if (name === 'check_payment') return checkPaymentTool(args, pc)
  const d = await desk()
  if (name === 'prepare_deposit' || name === 'prepare_withdraw') return vaultTool(name, args, d, pc)
  return loanTool(name as 'prepare_borrow' | 'prepare_repay' | 'prepare_collateral_withdraw', args, d, pc)
}
