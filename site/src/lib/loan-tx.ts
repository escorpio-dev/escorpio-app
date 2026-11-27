import { encodeAbiParameters, keccak256, numberToHex, parseAbi, type Address, type Hex, type PublicClient, type StateOverride } from 'viem'
import { MORPHO_BLUE } from '../data/morpho.ts'
import { showUnits } from './units.ts'
import { USDG_DECIMALS, erc20Abi, plainError, usdgOverride } from './vault-tx.ts'

// Borrowing USDG on Morpho Blue from the user's own wallet: put up collateral, borrow, repay, take the collateral back.
// Escorpio has no contract. Approvals go to Morpho Blue itself for the exact amount, and every step is simulated
// (eth_call) right before the wallet is asked to sign it.

const BLUE = MORPHO_BLUE as Address

export const blueAbi = parseAbi([
  'struct MarketParams { address loanToken; address collateralToken; address oracle; address irm; uint256 lltv; }',
  'function idToMarketParams(bytes32 id) view returns (address loanToken, address collateralToken, address oracle, address irm, uint256 lltv)',
  'function market(bytes32 id) view returns (uint128 totalSupplyAssets, uint128 totalSupplyShares, uint128 totalBorrowAssets, uint128 totalBorrowShares, uint128 lastUpdate, uint128 fee)',
  'function position(bytes32 id, address user) view returns (uint256 supplyShares, uint128 borrowShares, uint128 collateral)',
  'function supplyCollateral(MarketParams marketParams, uint256 assets, address onBehalf, bytes data)',
  'function withdrawCollateral(MarketParams marketParams, uint256 assets, address onBehalf, address receiver)',
  'function borrow(MarketParams marketParams, uint256 assets, uint256 shares, address onBehalf, address receiver) returns (uint256, uint256)',
  'function repay(MarketParams marketParams, uint256 assets, uint256 shares, address onBehalf, bytes data) returns (uint256, uint256)',
])
const oracleAbi = parseAbi(['function price() view returns (uint256)'])
const metaAbi = parseAbi(['function decimals() view returns (uint8)', 'function symbol() view returns (string)'])

export type MarketParams = { loanToken: Address; collateralToken: Address; oracle: Address; irm: Address; lltv: bigint }

export type Loan = {
  params: MarketParams
  collSymbol: string
  collDecimals: number
  price: bigint // USDG (raw) per collateral (raw), scaled by 1e36, from the market's own oracle
  collateral: bigint // collateral the user has in this market
  borrowShares: bigint
  debt: bigint // USDG owed now (rounded up, interest since the last market update not included)
  walletColl: bigint
  collAllowance: bigint // what Morpho Blue may pull of the collateral token
  walletUsdg: bigint
  usdgAllowance: bigint
  eth: bigint
}

const ORACLE_SCALE = 10n ** 36n
const WAD = 10n ** 18n
// Morpho Blue SharesMathLib
const VIRTUAL_SHARES = 10n ** 6n
const VIRTUAL_ASSETS = 1n
const sharesToAssetsUp = (shares: bigint, totalAssets: bigint, totalShares: bigint) =>
  (shares * (totalAssets + VIRTUAL_ASSETS) + (totalShares + VIRTUAL_SHARES) - 1n) / (totalShares + VIRTUAL_SHARES)

export async function readLoan(pc: PublicClient, account: Address, id: Hex): Promise<Loan> {
  const [loanToken, collateralToken, oracle, irm, lltv] = await pc.readContract({ address: BLUE, abi: blueAbi, functionName: 'idToMarketParams', args: [id] })
  const params = { loanToken, collateralToken, oracle, irm, lltv }
  const [mkt, pos, price, collSymbol, collDecimals, walletColl, collAllowance, walletUsdg, usdgAllowance, eth] = await Promise.all([
    pc.readContract({ address: BLUE, abi: blueAbi, functionName: 'market', args: [id] }),
    pc.readContract({ address: BLUE, abi: blueAbi, functionName: 'position', args: [id, account] }),
    pc.readContract({ address: oracle, abi: oracleAbi, functionName: 'price' }),
    pc.readContract({ address: collateralToken, abi: metaAbi, functionName: 'symbol' }),
    pc.readContract({ address: collateralToken, abi: metaAbi, functionName: 'decimals' }),
    pc.readContract({ address: collateralToken, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
    pc.readContract({ address: collateralToken, abi: erc20Abi, functionName: 'allowance', args: [account, BLUE] }),
    pc.readContract({ address: loanToken, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
    pc.readContract({ address: loanToken, abi: erc20Abi, functionName: 'allowance', args: [account, BLUE] }),
    pc.getBalance({ address: account }),
  ])
  const borrowShares = pos[1]
  return {
    params,
    collSymbol,
    collDecimals,
    price,
    collateral: pos[2],
    borrowShares,
    debt: borrowShares ? sharesToAssetsUp(borrowShares, mkt[2], mkt[3]) : 0n,
    walletColl,
    collAllowance,
    walletUsdg,
    usdgAllowance,
    eth,
  }
}

/** Most USDG this collateral can back at the market's liquidation line (borrowing all of it gets liquidated at once). */
/** "Max" on Repay: the whole debt when the wallet can cover it, otherwise everything the wallet holds. */
export const repayMax = (loan: Pick<Loan, 'debt' | 'walletUsdg'>) => (loan.walletUsdg < loan.debt ? loan.walletUsdg : loan.debt)

export const borrowLimit = (collateral: bigint, price: bigint, lltv: bigint) => (collateral * price) / ORACLE_SCALE * lltv / WAD

/** Value of the collateral in USDG (raw), at the oracle price. */
export const collateralValue = (collateral: bigint, price: bigint) => (collateral * price) / ORACLE_SCALE

/** Oracle price per whole collateral token, in USDG (a plain number for display). */
export const pricePerToken = (price: bigint, collDecimals: number, loanDecimals = 6) =>
  Number((price * 10n ** BigInt(collDecimals)) / ORACLE_SCALE) / 10 ** loanDecimals

/** Price per whole token at which this debt and collateral get liquidated. */
export const liquidationPrice = (debt: bigint, collateral: bigint, lltv: bigint, collDecimals: number, loanDecimals = 6) =>
  collateral === 0n ? 0 : (Number(debt) / 10 ** loanDecimals / (Number(collateral) / 10 ** collDecimals)) / (Number(lltv) / 1e18)

// Morpho Blue storage (checked by read-back in scripts/check-borrow.ts): slot 2 is position[id][user]; its second
// word packs borrowShares (low 128 bits) and collateral (high 128 bits). Used only to simulate a borrow before the
// collateral is in, so the user sees the whole plan would pass before signing anything.
export function positionOverride(id: Hex, user: Address, collateral: bigint, borrowShares: bigint): StateOverride {
  const inner = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [id, 2n]))
  const base = keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [user, inner]))
  return [
    {
      address: BLUE,
      stateDiff: [{ slot: numberToHex(BigInt(base) + 1n, { size: 32 }), value: numberToHex((collateral << 128n) | borrowShares, { size: 32 }) }],
    },
  ]
}

export const simulateApproveToken = (pc: PublicClient, account: Address, token: Address, amount: bigint) =>
  pc.simulateContract({ account, address: token, abi: erc20Abi, functionName: 'approve', args: [BLUE, amount] })

export const simulateSupplyCollateral = (pc: PublicClient, account: Address, p: MarketParams, amount: bigint) =>
  pc.simulateContract({ account, address: BLUE, abi: blueAbi, functionName: 'supplyCollateral', args: [p, amount, account, '0x'] })

export const simulateBorrow = (pc: PublicClient, account: Address, p: MarketParams, amount: bigint, stateOverride?: StateOverride) =>
  pc.simulateContract({ account, address: BLUE, abi: blueAbi, functionName: 'borrow', args: [p, amount, 0n, account, account], stateOverride })

/** Repay part of the debt by USDG amount, or all of it by shares (so no dust of debt is left). */
export const simulateRepay = (pc: PublicClient, account: Address, p: MarketParams, by: { assets: bigint } | { shares: bigint }, stateOverride?: StateOverride) =>
  pc.simulateContract({
    account,
    address: BLUE,
    abi: blueAbi,
    functionName: 'repay',
    args: 'shares' in by ? [p, 0n, by.shares, account, '0x'] : [p, by.assets, 0n, account, '0x'],
    stateOverride,
  })

export const simulateWithdrawCollateral = (pc: PublicClient, account: Address, p: MarketParams, amount: bigint) =>
  pc.simulateContract({ account, address: BLUE, abi: blueAbi, functionName: 'withdrawCollateral', args: [p, amount, account, account] })

// ---- one loan action, planned the same way by the site dialog and the MCP server -----------------------------------
// Escorpio stops at 90% of the market's liquidation line: a loan right at the line is liquidated by the next small move.

export type LoanMode = 'borrow' | 'repay' | 'collateral'
export type LoanSim = { ok: true; note: string } | { ok: false; why: string }
export const LOAN_CAP = 90n // percent of the liquidation line Escorpio lets a loan reach
export const LOAN_WARN = 80n
// Interest keeps building while the user signs, so a full repayment needs a little more allowance than today's debt.
export const withMargin = (debt: bigint) => debt + debt / 2000n + 10n
const U = (v: bigint) => showUnits(v, USDG_DECIMALS)
const Cn = (loan: Loan) => (v: bigint) => showUnits(v, loan.collDecimals, 2)

/** The loan as it would be after this action. */
export function loanAfter(loan: Loan, mode: LoanMode, coll: bigint, usdgAmt: bigint) {
  const collateral = mode === 'borrow' ? loan.collateral + coll : mode === 'collateral' ? loan.collateral - (coll > loan.collateral ? loan.collateral : coll) : loan.collateral
  const debt = mode === 'borrow' ? loan.debt + usdgAmt : mode === 'repay' ? (usdgAmt >= loan.debt ? 0n : loan.debt - usdgAmt) : loan.debt
  const limit = borrowLimit(collateral, loan.price, loan.params.lltv)
  return { collateral, debt, limit, used: limit ? Number((debt * 10_000n) / limit) / 100 : debt ? Infinity : 0 }
}

/** Most USDG still borrowable with this much collateral, at Escorpio's cap. */
export const loanCapRoom = (loan: Loan, after: { collateral: bigint }) => {
  const room = (borrowLimit(after.collateral, loan.price, loan.params.lltv) * LOAN_CAP) / 100n - loan.debt
  return room > 0n ? room : 0n
}

/** Why this action cannot go ahead, or undefined when it can be simulated. */
export function loanBlock(loan: Loan, mode: LoanMode, coll: bigint, usdgAmt: bigint) {
  const C = Cn(loan)
  const after = loanAfter(loan, mode, coll, usdgAmt)
  const over = after.debt > (after.limit * LOAN_CAP) / 100n
  if (mode === 'borrow') {
    if (coll === 0n && usdgAmt === 0n) return undefined
    if (coll > loan.walletColl) return `Your wallet holds ${C(loan.walletColl)} ${loan.collSymbol}.`
    if (over) return `That is past ${LOAN_CAP}% of the liquidation line. With this collateral you can borrow up to ${U(loanCapRoom(loan, after))} USDG here.`
  }
  if (mode === 'repay') {
    if (usdgAmt === 0n) return undefined
    if (loan.debt === 0n) return 'You owe nothing in this market.'
    const need = usdgAmt >= loan.debt ? loan.debt : usdgAmt
    if (need > loan.walletUsdg) return `Your wallet holds ${U(loan.walletUsdg)} USDG.`
  }
  if (mode === 'collateral') {
    if (coll === 0n) return undefined
    if (coll > loan.collateral) return `You have ${C(loan.collateral)} ${loan.collSymbol} in this market.`
    if (over) return `Taking that much back would put the loan past ${LOAN_CAP}% of the liquidation line. Repay first.`
  }
  if (loan.eth === 0n) return 'Your wallet has no ETH on Robinhood Chain for the network fee. Add a little first.'
  return undefined
}

export type LoanStep = { key: 'approve' | 'supply' | 'borrow' | 'repay' | 'withdraw'; label: string; text: string }

/** The signatures this action needs, in order (empty when there is nothing to do or it is blocked). */
export function loanPlan(loan: Loan, mode: LoanMode, coll: bigint, usdgAmt: bigint) {
  const C = Cn(loan)
  const repayAll = mode === 'repay' && loan.debt > 0n && usdgAmt >= loan.debt
  const repayPull = repayAll ? withMargin(loan.debt) : usdgAmt
  const steps: LoanStep[] = []
  if (!loanBlock(loan, mode, coll, usdgAmt)) {
    if (mode === 'borrow') {
      if (coll > 0n && loan.collAllowance < coll) steps.push({ key: 'approve', label: `Allow ${C(coll)} ${loan.collSymbol}`, text: '' })
      if (coll > 0n) steps.push({ key: 'supply', label: `Put in ${C(coll)} ${loan.collSymbol}`, text: `Put ${C(coll)} ${loan.collSymbol} in as collateral.` })
      if (usdgAmt > 0n) steps.push({ key: 'borrow', label: `Borrow ${U(usdgAmt)} USDG`, text: `Borrowed ${U(usdgAmt)} USDG to your wallet.` })
    }
    if (mode === 'repay' && usdgAmt > 0n) {
      if (loan.usdgAllowance < repayPull) steps.push({ key: 'approve', label: `Allow ${U(repayPull)} USDG`, text: '' })
      steps.push({ key: 'repay', label: repayAll ? 'Repay all' : `Repay ${U(usdgAmt)} USDG`, text: repayAll ? 'Loan repaid in full.' : `Repaid ${U(usdgAmt)} USDG.` })
    }
    if (mode === 'collateral' && coll > 0n)
      steps.push({ key: 'withdraw', label: `Take back ${C(coll)} ${loan.collSymbol}`, text: `${C(coll)} ${loan.collSymbol} back in your wallet.` })
  }
  return { repayAll, repayPull, steps }
}

/** Simulates the end result. Before the collateral is in, the borrow is simulated as if it were (Morpho Blue position
 * override); before the USDG approval exists, the repay is simulated as if it did. */
export async function simulateLoanPlan(pc: PublicClient, account: Address, id: Hex, loan: Loan, mode: LoanMode, coll: bigint, usdgAmt: bigint): Promise<LoanSim> {
  const C = Cn(loan)
  const p = loan.params
  const { repayAll, repayPull } = loanPlan(loan, mode, coll, usdgAmt)
  try {
    if (mode === 'borrow') {
      if (usdgAmt > 0n) {
        await simulateBorrow(pc, account, p, usdgAmt, coll > 0n ? positionOverride(id, account, loan.collateral + coll, loan.borrowShares) : undefined)
        return { ok: true, note: `the borrow of ${U(usdgAmt)} USDG would go through${coll > 0n ? ' once the collateral is in' : ''}.` }
      }
      if (loan.collAllowance >= coll) {
        await simulateSupplyCollateral(pc, account, p, coll)
        return { ok: true, note: `putting in ${C(coll)} ${loan.collSymbol} would go through.` }
      }
      await simulateApproveToken(pc, account, p.collateralToken, coll)
      return { ok: true, note: 'the approval would go through; the deposit itself is simulated again after it.' }
    }
    if (mode === 'repay') {
      const ov = loan.usdgAllowance < repayPull ? usdgOverride(account, BLUE, repayPull) : undefined
      const { result } = await simulateRepay(pc, account, p, repayAll ? { shares: loan.borrowShares } : { assets: usdgAmt }, ov)
      return { ok: true, note: `${U(result[0])} USDG of debt would be repaid.` }
    }
    await simulateWithdrawCollateral(pc, account, p, coll)
    return { ok: true, note: `${C(coll)} ${loan.collSymbol} would come back to your wallet.` }
  } catch (e) {
    return { ok: false, why: plainError(e) }
  }
}
