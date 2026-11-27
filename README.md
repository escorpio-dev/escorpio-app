# Escorpio

Escorpio is a USDG money desk on Robinhood Chain (chain id 4663), for people and their AI agents. It shows where idle
USDG earns the most in Morpho vaults and where USDG is cheapest to borrow against stock tokens, makes signed USDG
payment links, and lets you pay, deposit, withdraw, borrow and repay from your own wallet. Your AI agent can prepare
any of these over MCP; you sign. Every step is simulated on chain before you sign, and approvals are for the exact
amount.

[Website](https://escorpio.pro) · [Earn](https://escorpio.pro/earn) · [Borrow](https://escorpio.pro/borrow) · [Receive](https://escorpio.pro/receive) · [Method](https://escorpio.pro/method)

> Escorpio never holds your money and has no smart contract of its own: transactions go from your wallet straight to
> the Morpho vault or market. Rates change every block, vault shares can lose value, and a loan can be liquidated.
> Nothing here is financial advice.

## What it does

| Page | What you see | What you can do |
|---|---|---|
| Home | How much a typed amount of USDG would earn in a year at today's best open vault rate; the biggest vaults and the cheapest loan per collateral | Jump to Earn or Borrow |
| Earn | Every Morpho vault that holds real USDG (matched by contract address), its net rate after fees, what can be withdrawn now, and its risk notes | Deposit and withdraw |
| Borrow | Every USDG loan market per collateral token: borrow rate, liquidation line, what is still available | Put collateral in, borrow, repay, take collateral back |
| Receive | A form for the amount, an optional memo and how long the link works | Sign a payment request with your wallet and share the link |
| Pay | The request from a link, whether the payee's signature matches it, your USDG balance and a simulation | Pay it from your wallet straight to the payee |
| Receipt | A payment read from the chain: status, time, sender, every USDG transfer, and whether it paid the request | Open it on Blockscout |
| Method | Where every number comes from and what each risk note means | |

Pay out (payroll from a pasted list) is next. It is not shown on the site as a feature until it works.

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
  they clear. Full list on the [Method page](https://escorpio.pro/method).

- **Payment links without a database.** A request (payee, USDG, amount, memo, an 8-byte reference, expiry) is signed
  by the payee's wallet as EIP-712 typed data: a signature, not a transaction, so it costs nothing. The link carries
  the request and the signature. The pay page checks the signature (smart-contract wallets too, through ERC-1271) and
  refuses a link where anything was changed. The payer sends a plain USDG `transfer` with `ESC1` and the reference
  appended to the calldata (ERC-20 ignores trailing bytes), so the receipt page can show which request a transfer
  paid. Nothing about links or payments is stored anywhere.

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

A short guide for AI agents is at [`/llms.txt`](https://escorpio.pro/llms.txt), and an OpenAPI description at
[`/openapi.json`](https://escorpio.pro/openapi.json). The code is in `site/functions/api` and `site/server/api.ts`.

## MCP server

AI agents can use the same readings as tools, and prepare actions for the wallet owner to sign. Add
`https://escorpio.pro/mcp` as a remote MCP server (Streamable HTTP, no key). No tool can sign, send or approve: a prepare
tool checks the request with the same rules as the site, simulates it on chain when given a wallet address (the address
is not stored), and returns `open_url`, a link to escorpio.pro with the form filled in. The page reads the wallet
again, simulates again and waits for the owner's signature.

| Tool | What |
|---|---|
| `get_best_rates` | Best open vault, cheapest loan per collateral, widest rate gap |
| `list_vaults` | USDG vaults, best net rate first (`open_only`, `limit`) |
| `list_markets` | USDG loan markets, cheapest first (`collateral`, `limit`) |
| `explain_risk_notes` | What every risk note means |
| `prepare_deposit` | A deposit into one vault, checked and (with wallet) simulated. Returns open_url: escorpio.pro with the form filled in. (`vault, amount_usdg, wallet?`) |
| `prepare_withdraw` | A withdrawal back to the wallet, checked and simulated. (`vault, amount_usdg or "all", wallet?`) |
| `prepare_borrow` | Collateral in and/or a USDG loan. Refused past 90% of the liquidation line. With wallet: loan after, liquidation price, steps, simulation. (`market_id, collateral_amount?, borrow_usdg?, wallet?`) |
| `prepare_repay` | A repayment, checked and simulated. (`market_id, amount_usdg or "all", wallet?`) |
| `prepare_collateral_withdraw` | Collateral back to the wallet, refused if the loan would pass the 90% limit. (`market_id, collateral_amount, wallet?`) |
| `prepare_payment_request` | A USDG invoice: a link to /receive that the payee opens and signs. (`amount_usdg, memo?, valid_days?`) |
| `check_payment` | A payment read from the chain, and whether it paid that request. (`tx_hash, payment_link?`) |

```bash
claude mcp add --transport http escorpio https://escorpio.pro/mcp
```

The server reads the chain through Alchemy, then Chainstack, then the public RPC (the public one refuses most
`eth_call` from Cloudflare). Set the provider endpoints as Pages secrets, never in code: `npx wrangler pages secret put
RPC_ALCHEMY --project-name escorpio` and the same for `RPC_CHAINSTACK`. The site in the browser keeps the public RPC.

Code: `site/functions/mcp.ts`, `site/server/mcp.ts`, `site/server/rpc.ts` and `site/server/agent.ts`, checked by `npm run check:mcp` and
`npm run check:agent`. Link format: `site/src/lib/action-link.ts`.

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
npm test                # everything below, in order
npm run check           # desk logic on hand-made rows, then a live read of the Morpho API
npm run check:mcp       # MCP handshake, tool list, every tool on a live read, error paths
npm run check:deposit   # deposit 100 USDG into every open vault; refused when the approval is 1 unit short; withdraw all
npm run check:borrow    # per open market: borrow 100 USDG, refused past the limit, repay all, take collateral back, put collateral in
npm run check:agent     # every agent tool on live data: links, refusals, an empty wallet blocked, a real holder's deposit simulated, loan limits, payment checks
npm run check:receive   # sign a request with a throwaway key, link round trip, tampered links refused, expiry, pay with the reference, read a real receipt
```

GitHub Actions runs the build and `npm test` on every pull request and on main
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
  src/lib/receive.ts      payment requests: EIP-712 signing, link format, payment simulation, receipts
  src/components/         dialogs, rate rows, tables, header and footer
  src/pages/              Home, Earn, Borrow, Receive, Pay, Receipt, Method
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
