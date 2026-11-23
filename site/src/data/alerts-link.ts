// Shared with the alerts Worker (alerts/src/holder.ts): the exact text a wallet signs to link itself to a Telegram chat
// on escorpio.pro/link. Change it in one place only, or every link breaks.
export const ALERTS_BOT = 'EscorpioAlertsBot'
export const ALERTS_API = 'https://alerts.escorpio.pro'

export const linkMessage = (code: string, address: string) =>
  `Link my wallet to Escorpio rate alerts.\n\nTelegram code: ${code}\nWallet: ${address.toLowerCase()}\n\nThis is a signature, not a transaction. It costs nothing and moves nothing.`
