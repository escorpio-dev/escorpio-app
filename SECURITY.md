# Security

Escorpio is a static front end. It holds no funds, runs no server and has no smart contract of its own: every
transaction goes from the user's wallet straight to a Morpho vault or Morpho Blue market.

## What counts as a security issue

- A transaction built by the site that does something other than what the dialog says (wrong contract, wrong amount,
  wrong market, an approval larger than the typed amount).
- A way to make the site show a rate, balance, liquidation price or risk note that is not what the source says.
- A way to inject script or content into the site, or to get around the Content Security Policy in
  `site/public/_headers`.
- A dependency with a known issue that is reachable from the site.

Bugs in Morpho, USDG, Robinhood Chain or a wallet are out of scope here: report them to those projects.

## How to report

Use GitHub's private vulnerability reporting on this repository (Security tab, "Report a vulnerability"). Please do
not open a public issue for a security problem. Include the page, the steps, and the transaction or simulation you
saw. We aim to reply within 3 days.

Never send seed phrases or private keys. Nobody from Escorpio will ever ask for them.
