# Game assets

## Status: blocked, pending a licensing answer

The application renders **without** game artwork today. Products and buildings show as
text with category labels. Nothing is broken, and nothing needs to change for the site
to work — but recognisable product icons would make the Exchange substantially easier
to scan.

## What we know

- The encyclopedia response carries an `image` field per resource and per building
  **[REPORTED]** — a path or URL to the game's own artwork. We store it in
  `resources.image` and `buildings.image` when present.
- We have **not** confirmed the field's format, the asset origin, or whether the files
  are publicly reachable without authentication, because
  `www.simcompanies.com` is not reachable from this build environment. See
  `docs/SIMCOMPANIES_API_RESEARCH.md` §1.
- We have found **no licence, terms clause or statement** covering third-party display
  of game artwork. **[UNKNOWN]**

## Why nothing is displayed yet

Absence of a prohibition is not permission. Game art is the operators' copyright, and
hotlinking or re-hosting it without knowing the terms is not a decision to make
silently on someone else's behalf.

The technical groundwork is done and inert:

- `next.config.ts` permits the game's origin in `img-src` and in
  `images.remotePatterns`, so a URL would render through Next's image optimiser as
  soon as one is authorised.
- The domain model carries `image` through from the API.
- Every component already renders correctly without one, so enabling artwork is
  additive rather than a refactor.

## What is needed to unblock this

**A decision from the project owner, ideally after asking the operators.** One of:

1. **Confirmation that hotlinking is acceptable.** Simplest: reference the official
   URLs directly. No storage, no redistribution, and their CDN serves it. We would set
   sensible caching and never hide the origin.
2. **Confirmation that local caching is acceptable.** Better for performance and gentler
   on their bandwidth, but it is redistribution, so it needs explicit permission.
3. **Neither.** Then we commission or draw original category icons. Less recognisable,
   entirely ours, no ambiguity.

Option 1 is the smallest ask and the least burden on them. Worth asking first.

### If assets must be supplied locally

Should the answer be "cache them yourself" or "use your own", here is exactly what the
application expects.

```
public/game-assets/
├── products/
│   ├── <product-slug>.webp        # e.g. grapes.webp
│   └── ...
└── buildings/
    ├── <building-slug>.webp       # e.g. farm.webp
    └── ...
```

- **Naming:** the slug from `resources.slug` / `buildings.slug` — lower-case, hyphenated
  (`slugify` in `src/lib/util/slug.ts`). Stable, and already the URL segment.
- **Format:** WebP preferred, PNG accepted. Transparent background.
- **Size:** 128×128 source. The site renders at 24–64 px; Next generates the rest.
- **Weight:** under 15 kB each. A few hundred icons should stay well under 3 MB total.

With that directory present, the loader change is one function: prefer the local path,
fall back to the API's `image`, then to the text-only rendering that exists today.

## Our own assets

Everything visual that ships today is original to this project:

| Asset | File | Notes |
| --- | --- | --- |
| Logo mark | `public/logo-mark.svg` | Three ascending ledger columns on an anvil base |
| Wordmark | `public/logo-wordmark.svg` | Mark plus name |
| Favicon | `src/app/icon.svg` | The mark |

No resemblance to Sim Companies' own branding is intended, and the design deliberately
shares no motif with it.

## Attribution

Wherever game data or artwork appears, the footer states on every page that Ledgerforge
is independent and unofficial, and that game names and content belong to their owners.
That notice is not conditional on artwork being used — it applies to the data too.
