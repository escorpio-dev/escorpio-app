import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router'
import '@/index.css'
import '@/layout.css'
import { SiteFooter } from '@/components/site-footer'
import { SiteNav } from '@/components/site-nav'
import { BorrowPage } from '@/pages/borrow-page'
import { EarnPage } from '@/pages/earn-page'
import { HomePage } from '@/pages/home-page'
import { MethodPage } from '@/pages/method-page'
import { LinkPage } from '@/pages/link-page'
import { DocsPage } from '@/pages/docs-page'
import { StatsPage } from '@/pages/stats-page'
import { TokenPage } from '@/pages/token-page'
import { TOKEN_LIVE } from '@/data/token'

const TITLES: Record<string, string> = {
  '/': 'Escorpio · the USDG desk on Robinhood Chain',
  '/earn': 'Earn · USDG vault rates · Escorpio',
  '/borrow': 'Borrow · USDG loan rates · Escorpio',
  '/method': 'Method · Escorpio',
  '/link': 'Link your wallet · Escorpio alerts',
  '/stats': 'Stats · site traffic · Escorpio',
  '/docs': 'Docs · MCP server, agent skill and API · Escorpio',
  ...(TOKEN_LIVE ? { '/token': '$ESCORPIO · the Escorpio token' } : {}),
}

function RouteEffects() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    document.title = TITLES[pathname] ?? 'Escorpio'
  }, [pathname])
  return null
}

function NotFound() {
  return (
    <main className="wrap pb-28 pt-[130px] lg:pt-[180px]">
      <div className="label">Not on the chart</div>
      <h1 className="h-cond mt-3 !text-[clamp(2.5rem,6vw,4.5rem)]">This page does not exist</h1>
      <Link to="/" className="btn mt-8">
        <span aria-hidden>↳</span> Back to the desk
      </Link>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <RouteEffects />
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-bg">
        Skip to content
      </a>
      <SiteNav />
      <div id="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/earn" element={<EarnPage />} />
          <Route path="/borrow" element={<BorrowPage />} />
          <Route path="/method" element={<MethodPage />} />
          <Route path="/link" element={<LinkPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/docs" element={<DocsPage />} />
          {TOKEN_LIVE && <Route path="/token" element={<TokenPage />} />}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      <SiteFooter />
    </BrowserRouter>
  </StrictMode>,
)
