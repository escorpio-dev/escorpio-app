---
name: escorpio
description: Live USDG vault and loan rates on Robinhood Chain (chain 4663), read from Morpho through Escorpio, each with its size, plain-word risk notes and read time. Use when someone asks where to earn on idle USDG, the cheapest USDG loan against a stock token (NVDA, TSLA, AAPL, SPY, GOOGL and others), what a Morpho vault or market warning means, or how much traffic escorpio.pro gets. Read-only; never signs or moves money.
version: 0.1.0
metadata:
  hermes:
    tags: [defi, morpho, usdg, robinhood-chain, rates, mcp]
    category: finance
---

# Escorpio: USDG rates on Robinhood Chain

Escorpio (https://escorpio.pro) reads every USDG vault and loan market on Robinhood Chain from the public Morpho API at
most once a minute and says what each rate hides. No key, no sign-up, no account. Everything here is **read-only**: you
find the number, the person deposits or borrows themselves at escorpio.pro with their own wallet.

## Two ways to read it

**1. MCP (preferred when your agent supports it).** Remote server, Streamable HTTP, no auth:
`https://escorpio.pro/mcp`

| Tool | Use it for |
|---|---|
| `get_best_rates` | Start here: best open vault, biggest open vault, cheapest loan per collateral, widest rate gap |
| `list_vaults` | Every USDG vault, best net rate first (`open_only`, `limit`) |
| `list_markets` | Every USDG loan market, cheapest first (`collateral` as a symbol like `NVDA` or an address, `limit`) |
| `explain_risk_notes` | What each warning means and which ones are a stop |

**2. Plain HTTPS JSON**, if MCP is not connected. GET, no headers needed:

| Endpoint | Returns |
|---|---|
| `https://escorpio.pro/api/rates` | `bestOpenVault`, `biggestOpenVault`, `openVaults`, `cheapestLoanPerCollateral`, `widestGap`, `counts` |
| `https://escorpio.pro/api/vaults?open=1` | `vaults`, best net rate first (drop `open=1` to include closed ones) |
| `https://escorpio.pro/api/markets?collateral=NVDA` | `markets`, cheapest borrow rate first |
| `https://escorpio.pro/api/stats` | escorpio.pro traffic per UTC day from Cloudflare (bots included) |

Full schema: `https://escorpio.pro/openapi.json`. Every answer carries `readAt` and `ageSeconds`.

Units: rates are **percent per year** with 4 decimals (`netApyPct: 3.7723` means 3.7723% a year), money is **whole US
dollars** (`totalUsd`, `withdrawableUsd`, `freeToBorrowUsd`).

## How to answer with it

1. Read first, then answer. Never quote a rate from memory: rates change every block.
2. With every vault or loan you mention, give **all** of: the rate, the size (`totalUsd` for a vault, `freeToBorrowUsd`
   for a loan), its `notes` in plain words, and when it was read (`readAt`). A high rate on a tiny vault is not the same
   offer as a lower rate on a big one; say so when the best rate is small.
3. A note with `"stop": true` (deposits closed, withdrawals stuck, and similar) means do not point the person there.
   Say why.
4. For loans, mention `liquidationLtvPct`: borrowing against a stock token can be liquidated if its price falls.
5. If `ageSeconds` is over 300, say the reading is stale and read again before answering.
6. Link the page where they act: `https://escorpio.pro/earn` for vaults, `https://escorpio.pro/borrow` for loans.

## Never

- Never call a vault or loan "safe", "guaranteed" or "risk-free", and never tell someone to deposit or borrow. Give the
  readings and the risks; the decision is theirs. Escorpio's own line: "Readings, not advice."
- Never sign, send or approve anything, and never ask for a seed phrase or private key. Deposits and loans happen at
  escorpio.pro in the person's own wallet, simulated before they sign.
- Never invent a number the endpoints did not return. If an endpoint fails, say Escorpio could not be read just now.

## Example

> **Where can I park 10,000 USDG?**
> Read `get_best_rates` (or `/api/rates`). Answer like: "Best open vault right now: Purinta USDG at 3.77% a year, but it
> holds only $67k (note: small, under $100k). The biggest open vault, Galaxy USDG RH Stock Tokens, pays 0.67% and holds
> $503k. Read 15:13 UTC. Compare both at https://escorpio.pro/earn. Readings, not advice."
