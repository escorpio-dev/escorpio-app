import { Link } from 'react-router'
import { ArrowSvg } from '@/components/arrow-svg'
import { GITHUB_URL, GithubIcon, X_HANDLE, X_URL, XIcon } from '@/components/brand-icons'
import { TelegramIcon } from '@/components/telegram-icon'
import { ALERTS_BOT } from '@/data/alerts-link'
import { EXPLORER, USDG } from '@/data/morpho'

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const

// Footer (classes in layout.css): a call-out column, then two fixed link columns. The call-out column has
// a button to the method page until there is a backend.
export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="width">
        <div className="col k-flex">
          <h3>Read the numbers yourself</h3>
          <p>Every rate on Escorpio comes from the public Morpho API and shows when it was read. Not affiliated with Robinhood or Morpho. Nothing here is financial advice.</p>
          <div className="k-footer-cta">
            <Link to="/method" className="button">
              <ArrowSvg />
              How we read them
            </Link>
          </div>
        </div>
        <div className="col k-fixed">
          <h3>Escorpio</h3>
          <ul>
            <li><Link to="/">Home</Link></li>
            <li><Link to="/earn">Earn</Link></li>
            <li><Link to="/borrow">Borrow</Link></li>
            <li><Link to="/method">Method</Link></li>
            <li><Link to="/stats">Stats</Link></li>
          </ul>
        </div>
        <div className="col k-fixed">
          <h3>Follow</h3>
          <ul>
            <li><a href={X_URL} {...ext} className="k-logo-line"><XIcon size={15} />{X_HANDLE}</a></li>
            <li><a href={GITHUB_URL} {...ext} className="k-logo-line"><GithubIcon size={15} />GitHub</a></li>
            <li><a href={`https://t.me/${ALERTS_BOT}`} {...ext} className="k-logo-line"><TelegramIcon size={15} />Rate alerts</a></li>
          </ul>
        </div>
        <div className="col k-fixed">
          <h3>On chain</h3>
          <ul>
            <li><a href={`${EXPLORER}/address/${USDG}`} {...ext}>USDG contract</a></li>
            <li>
              <span className="k-logo-line">
                <img src="/logos/robinhood-white.svg" alt="" width={16} height={16} />
                Robinhood Chain
              </span>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  )
}
