# Escorpio

Escorpio is a USDG money desk on Robinhood Chain (chain id 4663). It shows where idle USDG earns the most in Morpho
vaults and where USDG is cheapest to borrow against stock tokens, then lets you deposit, withdraw, borrow and repay
from your own wallet. Every step is simulated on chain before you sign, and approvals are for the exact amount.

[Website](https://escorpio.pages.dev) · [Earn](https://escorpio.pages.dev/earn) · [Borrow](https://escorpio.pages.dev/borrow) · [Method](https://escorpio.pages.dev/method)

> Escorpio never holds your money and has no smart contract of its own: transactions go from your wallet straight to
> the Morpho vault or market. Rates change every block, vault shares can lose value, and a loan can be liquidated.
> Nothing here is financial advice.

## What it does

| Page | What you see | What you can do |
|---|---|---|
| Home | How much a typed amount of USDG would earn in a year at today's best open vault rate; the biggest vaults and the cheapest loan per collateral | Jump to Earn or Borrow |
| Earn | Every Morpho vault that holds real USDG (matched by contract address), its net rate after fees, what can be withdrawn now, and its risk notes | Deposit and withdraw |
| Borrow | Every USDG loan market per collateral token: borrow rate, liquidation line, what is still available | Put collateral in, borrow, repay, take collateral back |
| Method | Where every number comes from and what each risk note means | |

Receive (USDG payment links and invoices) and Pay out (payroll from a pasted list) are next. They show as
"Coming next" on the site until they work.

## How it works

```
browser ──► Escorpio API /api/desk ──► Morpho API (rates, vaults, markets, risk warnings), at most once a minute
        ──► Robinhood Chain RPC (your balances, simulations, receipts)
        ──► your wallet (EIP-6963) ──► Morpho vault / Morpho Blue
```

- **No custody, almost no server.** The site is static files on Cloudflare Pages plus a few Pages Functions that read
  the public Morpho API once a minute and pass its answer through unchanged. Your browser checks every row itself, and
  falls back to Morpho directly if our API does not answer. Wallet reads and transactions go straight to the public
  Robinhood Chain RPC.
- **Simulated first.** Each step runs as an `eth_call` before the wallet opens. A deposit that still needs its
  approval, or a borrow before the collateral is in, is simulated with state overrides as if the earlier step were
  done, so you see whether the whole flow would pass before signing anything. Each step is simulated again, without
  overrides, right before you sign it.
- **Exact approvals.** USDG is approved to the vault, and collateral to Morpho Blue, for the amount you typed.
  Repaying everything approves the debt plus 0.05% for interest that accrues before the block lands.
- **Loan cap.** Escorpio stops a borrow past 90% of the liquidation line and warns from 80%, and shows the
  liquidation price before you sign.
- **Risk notes.** Morpho's own warnings plus Escorpio's: small vault or market, under 30 days old, almost nothing
  withdrawable, no named curator, very high or negative rate, almost fully borrowed. Some notes block deposits until
  they clear. Full list on the [Method page](https://escorpio.pages.dev/method).

Contracts used: USDG `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`, Morpho Blue
`0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010`, and the Morpho vaults listed on the Earn page.

## Public API

No key, no login, JSON open to any origin. Every reading says when it was read; rates are percent per year.

| Endpoint | What |
|---|---|
| [`/api/rates`](https://escorpio.pro/api/rates) | Best open vault, cheapest loan per collateral, widest rate gap |
| [`/api/vaults`](https://escorpio.pro/api/vaults) | Every USDG vault, best net rate first (`?open=1` for open ones only) |
| [`/api/markets`](https://escorpio.pro/api/markets) | Every USDG loan market, cheapest first (`?collateral=<address or symbol>`) |
| [`/api/desk`](https://escorpio.pro/api/desk) | Morpho's answer exactly as the site reads it, read time in `x-escorpio-read-at` |

```bash
curl -s https://escorpio.pro/api/rates
```

A short guide for AI agents is at [`/llms.txt`](https://escorpio.pro/llms.txt). The code is in `site/functions/api`
and `site/server/api.ts`.

## Run it locally

Node.js 22.18 or newer (the check scripts run TypeScript directly).

```bash
cd site
npm install
npm run dev          # http://localhost:5173
npm run build        # type check + production build into dist/
npm run preview:pages  # dist/ plus the /api functions, http://localhost:4401
```

## Checks

None of these move money. They run against the real contracts on Robinhood Chain with `eth_call`, using state
overrides to give a made-up address balances, approvals, collateral or debt.

```bash
npm test                # all three below, in order
npm run check           # desk logic on hand-made rows, then a live read of the Morpho API
npm run check:deposit   # deposit 100 USDG into every open vault; refused when the approval is 1 unit short; withdraw all
npm run check:borrow    # per open market: borrow 100 USDG, refused past the limit, repay all, take collateral back, put collateral in
```

GitHub Actions runs the build and all three checks on every pull request and on main
([.github/workflows/ci.yml](.github/workflows/ci.yml)).

Every row from the Morpho API is checked before it reaches the page: a market with a malformed id, a bad address, a
missing rate or an impossible liquidation line is dropped rather than shown as 0%. `npm run check` covers these
cases with broken fixture rows.

## Layout

```
site/
  src/data/morpho.ts      Morpho API query, row validation, contract addresses
  src/data/desk.ts        rankings, cheapest loan, risk notes
  src/lib/chain.ts        Robinhood Chain client
  src/lib/use-wallet.ts   wallet discovery (EIP-6963), connect, switch chain
  src/lib/vault-tx.ts     vault reads and simulations
  src/lib/loan-tx.ts      Morpho Blue reads, loan math and simulations
  src/lib/use-tx.ts       simulate, sign, wait, refresh: one step
  src/components/         dialogs, rate rows, tables, header and footer
  src/pages/              Home, Earn, Borrow, Method
  scripts/                the checks above
  public/_headers         security headers and content security policy for Cloudflare Pages
```

## Token

No token has been launched. If one is, its contract address will be listed here, on the website and on Escorpio's X
account at the same time. Any other address is not ours.

## Contributing

`main` is protected: changes go in through a pull request. Commits follow
[Conventional Commits](https://www.conventionalcommits.org/) (`feat(site): ...`, `fix(site): ...`).
Spot something rough? Open an issue.

## Security

See [SECURITY.md](SECURITY.md) for what to report and how (privately, through GitHub).

## License

[MIT](LICENSE)
