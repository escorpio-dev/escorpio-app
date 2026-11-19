import { Link, NavLink } from 'react-router'
import { EscorpioWordmark } from '@/components/escorpio-wordmark'

// Floating header (classes in layout.css). No X or GitHub links yet: the
// accounts do not exist, and a dead link is worse than none.
export function SiteNav() {
  return (
    <div className="relative">
      <header className="header">
        <div className="width">
          <Link to="/" className="logo" aria-label="Escorpio home">
            <EscorpioWordmark />
          </Link>
          <ul>
            {(
              [
                ['/earn', 'Earn'],
                ['/borrow', 'Borrow'],
                ['/method', 'Method'],
              ] as const
            ).map(([to, name]) => (
              <li key={to}>
                <NavLink to={to}>{name}</NavLink>
              </li>
            ))}
          </ul>
        </div>
      </header>
    </div>
  )
}
