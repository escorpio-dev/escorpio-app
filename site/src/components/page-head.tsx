import type { ReactNode } from 'react'
import { DotsDivider } from '@/components/dots-divider'

// Title block for the inner pages: the dots divider, a condensed uppercase title, one mono paragraph.
// `bg` puts a full-width picture behind it, like the home hero (styles: .page-bg in layout.css). The picture is the
// page's largest paint, so it is a real <img> with high fetch priority, AVIF first and WebP as the fallback.
export function PageHead({ kicker, title, children, bg }: { kicker: string; title: ReactNode; children?: ReactNode; bg?: string }) {
  return (
    <>
      {bg && (
        <div className="page-bg" aria-hidden>
          <picture>
            <source type="image/avif" srcSet={`/media/${bg}.avif`} />
            <img src={`/media/${bg}.webp`} alt="" width={1920} height={1072} fetchPriority="high" />
          </picture>
        </div>
      )}
      <header className="text-col pt-6 md:pt-10">
        <DotsDivider />
        <div className="label mt-8">{kicker}</div>
        <h1 className="h-cond mt-3">{title}</h1>
        {children && <p className="mt-6 text-[17px] leading-[1.65] text-ink/85 md:text-[19px]">{children}</p>}
      </header>
    </>
  )
}
