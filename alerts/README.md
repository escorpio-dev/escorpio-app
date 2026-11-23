# escorpio-alerts

Telegram rate alerts for USDG on Robinhood Chain, as a Cloudflare Worker at `alerts.escorpio.pro`.

- `/vault 5`: an open USDG vault pays 5% or more (same rule as the site headline: listed, open, $50k+, no stop note).
- `/borrow NVDA 2`: the cheapest USDG loan against NVDA ($10k+ free to borrow, no stop note) costs 2% or less.
- `/list`, `/stop`, `/stop <n>`, `/me`, `/help`.
- `/link`, `/unlink`: link a wallet holding $ESCORPIO on [escorpio.pro/link](https://escorpio.pro/link) by signing one
  message (never a transaction). Holders get 10 alerts checked every minute and a daily digest at 00:05 UTC; the
  balance is read again every day. Off until `TOKEN_ADDRESS` and `HOLDER_MIN` are set in `wrangler.toml` (launch day).

Free: 2 alerts per chat, checked every 15 minutes, at most one message per alert per hour. Every message carries the
vault or market size, its risk notes and the read time, and is never sent on a reading older than 5 minutes. Readings,
not advice.

How it works: a cron every minute reads Escorpio's own [`/api/desk`](https://escorpio.pro/api/desk), checks the alerts
that are due with the same `parseDesk` and `desk.ts` rules as the site, and calls Telegram's `sendMessage`. D1 stores
only the Telegram chat id, the alert and when it was last sent.

```bash
node scripts/check-alerts.ts   # commands, matching, limits, stale guard, and the Worker against an in-memory SQLite
```

Setup (once): create the bot with @BotFather, `npx wrangler d1 create escorpio-alerts` (put the id in `wrangler.toml`),
`npx wrangler d1 execute escorpio-alerts --remote --file=schema.sql` (an existing database applies `migrations/` in order), `npx wrangler secret put TELEGRAM_BOT_TOKEN`,
`npx wrangler secret put TELEGRAM_WEBHOOK_SECRET`, deploy, then point Telegram's webhook at
`https://alerts.escorpio.pro/telegram` with the same secret.
