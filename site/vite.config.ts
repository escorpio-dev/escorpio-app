import { readFileSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

// Static site plus a few Cloudflare Pages Functions (functions/api, not part of this build). In `npm run dev` there is
// no /api, so the browser falls back to reading the Morpho API directly; `npm run preview:pages` serves both.

// Facts in plain HTML for crawlers, research sites (HEY Research) and agents that do not run JavaScript: the API
// description links in <head>, and a <noscript> block with the code, the API, the MCP server and, once the token exists,
// its contract address. The CA is read from src/data/token.ts, the same single setting the pages use, so launch day
// stays one change. Visitors with JavaScript never see the <noscript> block.
const SITE = 'https://escorpio.pro'
const REPO = 'https://github.com/escorpio-dev/escorpio-app'
const EXPLORER = 'https://robinhoodchain.blockscout.com/token/'
const ROOT = '<div id="root"></div>'
const HEAD_END = '</head>'

export function tokenAddress(): string {
  const src = readFileSync(path.resolve(import.meta.dirname, 'src/data/token.ts'), 'utf8')
  const m = src.match(/^export const TOKEN_ADDRESS: string = '([^']*)'/m)
  if (!m) throw new Error('src/data/token.ts: TOKEN_ADDRESS line not found, static facts would miss the CA')
  return m[1]
}

export function apiLinks(): string {
  return [
    `<link rel="service-desc" type="application/json" href="${SITE}/openapi.json" />`,
    `<link rel="service-doc" href="${SITE}/llms.txt" />`,
  ].join('\n    ')
}

export function projectFacts(ca: string): string {
  const token = /^0x[0-9a-fA-F]{40}$/.test(ca)
    ? `<p>Token: $ESCORPIO on Robinhood Chain (chain id 4663), contract <a href="${EXPLORER}${ca}">${ca}</a>. This is the only Escorpio token. Details: <a href="${SITE}/token">${SITE}/token</a>.</p>`
    : ''
  return [
    '<noscript>',
    '<p>Escorpio: live USDG vault and loan rates on Robinhood Chain, read from Morpho, with the risks in plain words. Non-custodial: you sign from your own wallet.</p>',
    `<p>Code: <a href="${REPO}">${REPO}</a>. API: <a href="${SITE}/api">${SITE}/api</a>, <a href="${SITE}/openapi.json">OpenAPI</a> and <a href="${SITE}/llms.txt">llms.txt</a>. MCP server: ${SITE}/mcp. Agent skill: npx skills add escorpio-dev/escorpio-app.</p>`,
    `<p>X: <a href="https://x.com/escorpiohq">@escorpiohq</a>. Site traffic: <a href="${SITE}/stats">${SITE}/stats</a>.</p>`,
    token,
    '</noscript>',
  ]
    .filter(Boolean)
    .join('\n    ')
}

function staticFacts(): Plugin {
  return {
    name: 'escorpio-static-facts',
    transformIndexHtml: (html) => {
      if (!html.includes(ROOT)) throw new Error('index.html lost the root div')
      if (!html.includes(HEAD_END)) throw new Error('index.html lost </head>')
      return html.replace(HEAD_END, '  ' + apiLinks() + '\n  ' + HEAD_END).replace(ROOT, ROOT + '\n    ' + projectFacts(tokenAddress()))
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), staticFacts()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
})
