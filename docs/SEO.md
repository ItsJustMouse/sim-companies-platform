# SEO

## The strategy in one line

Every indexable page answers a question a Sim Companies player actually asks, using
data that is genuinely ours. There are no pages generated to hold keywords.

That is not modesty about tactics — it is the tactic. The competition for "sim
companies grapes price" is thin, static wiki pages and out-of-date spreadsheets. A page
with a live price, a real chart built from our own collected history, the production
chain and a worked profitability estimate wins on merit and keeps winning, because the
data refreshes itself.

## What is indexed

| Pages | Count | Why they deserve to rank |
| --- | --- | --- |
| Product pages | One per product | Live price, our price history, quality pricing, recipe, worked profit |
| Building pages | One per building | Cost, wages, and every product ranked by current profit |
| Calculators | 8 | Each answers one specific question, with its formula shown |
| Guides | 7 | Original writing, worked examples, no wiki paraphrasing |
| Market pages | 4 | Movers, volatility, liquidity, heatmap |
| Reference | About, methodology, status, privacy, terms | Trust signals, and genuinely read |

Excluded in `robots.ts`: `/account`, `/admin`, `/api`. Nothing there should be
indexed, and crawl budget spent on it is wasted.

## Technical implementation

- **Server-rendered** public pages. Static or ISR where the data allows, so crawlers get
  full HTML immediately with a fast TTFB.
- **Canonical URLs** on every page via `buildMetadata`, which also emits Open Graph and
  Twitter cards. One helper, so no page can quietly ship without them.
- **Structured data:** `WebSite` with `SearchAction` sitewide; `BreadcrumbList` on every
  nested page; `Product` with `AggregateOffer` on product pages; `Article` on guides.
  JSON-LD is escaped before serialisation so a value cannot break out of the script tag.
- **Sitemap** generated from live data, with change frequencies that reflect reality —
  product pages hourly, guides monthly. Degrades to a smaller sitemap rather than
  failing if the database is unreachable.
- **Semantic HTML.** One `h1` per page, ordered headings, `<table>` with `<caption>` and
  scoped headers, real `<nav>` landmarks, breadcrumbs as navigation rather than
  decoration.

### Product currency in structured data

`priceCurrency` is `XXX` — the ISO code for "no currency" — because these are in-game
prices, not real-world offers. Declaring `USD` would be a false claim in machine-readable
data, and the kind of thing that earns a manual action.

## Core Web Vitals

The choices that matter here were made for other reasons and happen to help:

- **No charting library.** In-house SVG charts keep the JavaScript budget small on the
  pages most likely to be landed on from search.
- **No web fonts.** A system font stack means no font request, no FOUT, no layout shift.
- **Server Components by default.** The only client JavaScript in the shell is the mobile
  nav, the theme toggle and search.
- **Theme applied before first paint** by an inline script, so there is no flash and no
  shift.
- **Fixed dimensions** on the logo and charts; skeletons reserve space for async content.

## Accessibility, which is also SEO

Targets WCAG 2.1 AA:

- Colour is never the only signal. Every red/green figure carries an arrow and a
  screen-reader-only word ("increase"/"decrease").
- Visible focus rings on every interactive element; a skip link to main content.
- Search is an ARIA combobox with `aria-activedescendant` and a live region.
- Sortable table headers expose `aria-sort`; every table has a caption.
- `prefers-reduced-motion` respected.
- Both themes are contrast-checked against their own backgrounds.

## Internal linking

Structural rather than bolted on:

- Product → its inputs, its consumers, its building, its calculators
- Building → every product it can make
- Guide → the tool that applies what it just taught, and the next guide
- Calculator → the questions a reader is likely to ask next
- Scanner and market pages → the product pages they rank

`src/lib/calculators/catalog.ts` and `src/lib/content/guides.ts` declare their own
relationships, so adding an entry links it from everywhere at once.

## What we will not do

No keyword stuffing, doorway pages, duplicate-content farms, spun product descriptions,
link schemes, or cloaking. Beyond the ethics, they are fragile: this site's advantage is
data that updates itself, and that advantage compounds while tricks decay.

## Measuring it

Worth watching, in order:

1. Indexed page count vs. sitemap size — a large gap means quality or crawl problems.
2. Impressions on `[product] price` queries — the core intent.
3. Core Web Vitals from field data, not lab scores.
4. Which products draw traffic — it should inform what the scanner surfaces.

Use privacy-respecting analytics or none. There is no third-party tracker on this site
today, and the privacy page says so, so adding one is a promise to renegotiate.
