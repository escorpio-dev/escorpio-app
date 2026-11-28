# Changelog

All notable changes to Escorpio. Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- Vault rate alerts show the vault's short address next to its name, since two vaults can share a name.

### Added
- Vault sizes checked on Robinhood Chain: the API reads each vault's `asset()` and `totalAssets()` and compares them
  with Morpho's numbers (`checkedOnChain`, `onChain`).
- Prepare tools say that any address holding USDG can be used to simulate a plan, so checking needs no funds.

## [0.1.0] - 2026-11-27

First release: the USDG desk on Robinhood Chain (chain 4663), for people and their AI agents.

### Earn
- Every Morpho vault that holds real USDG, net rate after fees, what can be withdrawn now, and risk notes (#1, #13).
- Deposit and withdraw from your own wallet, simulated before you sign, approvals for the exact amount (#1, #2).

### Borrow
- Every USDG loan market per collateral token, with the liquidation line and what is still available (#1, #5, #6, #22).
- Put collateral in, borrow, repay and take collateral back; loans stop at 90% of the liquidation line (#1, #2).

### Receive
- Signed USDG payment links (EIP-712), a pay page that checks the signature and simulates the transfer, and a receipt
  read from the chain. No database (#27).

### For AI agents
- Public JSON API and OpenAPI file (#10), MCP server (#11), agent skill (#18), setup docs (#20).
- MCP tools that prepare a deposit, withdrawal, loan action or payment request and check a payment. They return a
  filled-in link; only the wallet owner can sign (#27).
- The MCP server reads the chain through Alchemy and Chainstack and answers without a simulation when no RPC
  responds (#28, #29).

### Alerts
- USDG rate alerts on Telegram and the alerts page (#15, #25).

### Site
- Home desk, stats, method page, static facts for crawlers, escorpio.pro domain (#7, #9, #12, #14, #16, #17, #19, #21,
  #23, #24).

### Security
- An RPC outage no longer reads as a bad signature on the pay page or a missing payment on the receipt page (#28).
- CodeQL code scanning, Dependabot and `npm audit` in CI.

[Unreleased]: https://github.com/escorpio-dev/escorpio-app/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/escorpio-dev/escorpio-app/releases/tag/v0.1.0
