import { Link, NavLink } from 'react-router'
import { GITHUB_URL, GithubIcon, X_HANDLE, X_URL, XIcon } from '@/components/brand-icons'
import { EscorpioWordmark } from '@/components/escorpio-wordmark'
import { TOKEN_LIVE } from '@/data/token'

// Floating header (classes in layout.css): page links, then the X and GitHub marks.
export function SiteNav() {
  return (
    <div className="relative">
      <header className="header">
        <div className="width">
          <Link to="/" className="logo" aria-label="Escorpio home">
            <EscorpioWordmark />
          </Link>
          {/* Under 600px the header keeps four links: Method drops first, then Stats once Token joins after launch. Both stay in the footer. */}
          <ul className={TOKEN_LIVE ? 'has-token' : undefined}>
            {(
              [
                ['/earn', 'Earn'],
                ['/borrow', 'Borrow'],
                ['/method', 'Method'],
                ['/stats', 'Stats'],
                ['/docs', 'Docs'],
                ...(TOKEN_LIVE ? [['/token', 'Token']] : []),
              ] as [string, string][]
            ).map(([to, name]) => (
              <li key={to} className={to === '/method' ? 'k-nav-method' : to === '/stats' ? 'k-nav-stats' : undefined}>
                <NavLink to={to}>{name}</NavLink>
              </li>
            ))}
            <li className="k-social">
              <a href={X_URL} target="_blank" rel="noopener noreferrer" aria-label={`Escorpio on X, ${X_HANDLE}`} title={X_HANDLE}>
                <XIcon size={16} />
              </a>
            </li>
            <li className="k-social">
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="Escorpio code on GitHub" title="GitHub">
                <GithubIcon size={17} />
              </a>
            </li>
          </ul>
        </div>
      </header>
    </div>
  )
}
