import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { GlobalBanners } from '@/components/layout/global-banners';
import { JsonLd } from '@/components/ui/json-ld';
import { SITE, organisation, siteUrl } from '@/lib/seo';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl('/')),
  title: {
    default: `${SITE.name} — Sim Companies market prices, analytics and calculators`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  manifest: '/site.webmanifest',
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Matches the header surface in each scheme so mobile browser chrome blends in.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0e13' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        {/*
          Applies the stored theme before first paint. Without this the page renders
          in the system theme and then flips, which is worse than no toggle at all.
          Inline because it must run before the body is painted.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('lf-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <GlobalBanners />
        <SiteHeader />
        <main id="main" className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
          {children}
        </main>
        <SiteFooter />
        <JsonLd data={organisation()} />
      </body>
    </html>
  );
}
