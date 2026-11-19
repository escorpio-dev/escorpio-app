import { useState } from 'react'
import { formatUnits, parseUnits, type Hash } from 'viem'
import { publicClient } from '@/lib/chain'
import { walletClient } from '@/lib/use-wallet'
import { plainError } from '@/lib/vault-tx'

// One signed step, the same way everywhere: simulate it again right before signing, ask the wallet, wait for the
// chain, then re-read balances. Errors come back as one plain sentence.
export function useTx(refresh: () => Promise<void>) {
  const [busy, setBusy] = useState<string>()
  const [err, setErr] = useState<string>()
  async function send(label: string, simulate: () => Promise<{ request: unknown }>): Promise<Hash | undefined> {
    setErr(undefined)
    setBusy(label)
    try {
      const { request } = await simulate()
      setBusy(`${label}: confirm in your wallet`)
      const hash = await walletClient().writeContract(request as never)
      setBusy(`${label}: waiting for the chain`)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('The transaction failed on chain. Nothing moved.')
      await refresh()
      return hash
    } catch (e) {
      setErr(plainError(e))
    } finally {
      setBusy(undefined)
    }
  }
  return { busy, err, setErr, send }
}

/** Typed amount to raw units; anything unreadable is 0. */
export function toUnits(raw: string, decimals: number) {
  try {
    const clean = raw.replace(/,/g, '').trim()
    return clean ? parseUnits(clean, decimals) : 0n
  } catch {
    return 0n
  }
}

/** Raw units to a short readable number (up to 6 decimals, thousands separated). A tiny amount that would round to
 * zero says "< 0.01", so a dust debt never reads as nothing owed. */
export function showUnits(v: bigint, decimals: number, digits = 2) {
  const maxDigits = Math.max(digits, decimals > 6 ? 6 : digits)
  const n = Number(formatUnits(v, decimals))
  if (v > 0n && n < 10 ** -maxDigits) return `< ${(10 ** -maxDigits).toFixed(maxDigits)}`
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: maxDigits })
}
