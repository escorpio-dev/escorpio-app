import { useState } from 'react'
import { type Hash } from 'viem'
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

// Kept here so existing imports work; the functions live in units.ts (no React, shared with the MCP server).
export { showUnits, toUnits } from '@/lib/units'
