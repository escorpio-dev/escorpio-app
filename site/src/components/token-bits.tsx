import { useState } from 'react'
import { Link } from 'react-router'
import { HOLDER_MIN, PERKS, TOKEN_ADDRESS, TOKEN_LIVE, shortAddress } from '@/data/token'

// Pieces of the $ESCORPIO token shown on the site. Each renders nothing until TOKEN_LIVE (data/token.ts).

function useCopy(text: string) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }
  return { copied, copy }
}

// Hero line: "$ESCORPIO CA 0x1234…abcd". One click copies the full address; "Token" opens /token.
export function HeroCa() {
  const { copied, copy } = useCopy(TOKEN_ADDRESS)
  if (!TOKEN_LIVE) return null
  return (
    <p className="k-ca">
      <button type="button" onClick={copy} title="Copy the full contract address" aria-label={`Copy the $ESCORPIO contract address ${TOKEN_ADDRESS}`}>
        <span className="k-ca-tick">$ESCORPIO</span> CA <span className="k-ca-addr">{shortAddress(TOKEN_ADDRESS)}</span>
        <span className="k-ca-copy" aria-live="polite">
          {copied ? 'Copied' : 'Copy'}
        </span>
      </button>
      <Link to="/token" className="k-link">
        Token
      </Link>
    </p>
  )
}

// The full address with a Copy button (the MCP endpoint box style).
export function CaBox() {
  const { copied, copy } = useCopy(TOKEN_ADDRESS)
  if (!TOKEN_LIVE) return null
  return (
    <div className="k-endpoint">
      <code>{TOKEN_ADDRESS}</code>
      <button type="button" className="button" onClick={copy} aria-live="polite">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

export const holderMinText = () => `${HOLDER_MIN.toLocaleString('en-US')} $ESCORPIO`

// Free vs holder, only what is switched on.
export function PerksTable() {
  if (!TOKEN_LIVE) return null
  return (
    <div className="k-perks" role="table" aria-label="Free and holder plans">
      <div className="k-perks-row k-perks-head" role="row">
        <span role="columnheader" />
        <span role="columnheader">Free</span>
        <span role="columnheader">Holder</span>
      </div>
      {PERKS.map(([what, free, holder]) => (
        <div className="k-perks-row" role="row" key={what}>
          <span role="rowheader">{what}</span>
          <span role="cell" data-plan="Free">
            {free}
          </span>
          <span role="cell" data-plan="Holder">
            {holder}
          </span>
        </div>
      ))}
    </div>
  )
}
