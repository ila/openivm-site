# openivm.org

Source for [openivm.org](https://openivm.org), the website of OpenIVM: open-source incremental view maintenance.

Stack: [Astro](https://astro.build) (static output) · TypeScript · canvas-rendered hero · deployed on Cloudflare.

## Develop

Requires Node ≥ 22.12.

```sh
npm install
npm run dev       # http://localhost:4321
npm run build     # type-check + build to dist/
npm run preview   # serve dist/ locally
```

## Layout

```
src/
  layouts/Base.astro        html shell, meta, fonts
  pages/index.astro         landing page
  pages/how-it-works.astro  model, architecture, generated SQL, delta rules
  pages/quickstart.astro    build + examples + reference
  pages/404.astro
  components/Hero.astro     hero copy + animated query-plan canvas
  components/DeltaDemo.astro  interactive insert/delete/refresh toy
  components/*Diagram.astro inline SVG diagrams
  scripts/hero-plan.ts      the hero animation (burn_by_agent query plan)
  styles/global.css         design tokens and base styles
wrangler.jsonc              Cloudflare Workers static-assets config
```

## Deploy (Cloudflare)

The site is a Cloudflare Worker serving static assets (`wrangler.jsonc`), bound to `openivm.org` and
`www.openivm.org` as custom domains.

**Every push to `main` deploys automatically** through GitHub Actions (`.github/workflows/ci.yml`): the workflow
builds and type-checks the site, then publishes it with Wrangler. Pull requests are built and checked but never
deployed, so open a PR, let CI pass, and merge. To redeploy without a change, run the workflow manually from the
**Actions** tab.

Contributors only need write access to this repository. The workflow authenticates with two repository secrets:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token created from the **Edit Cloudflare Workers** template, scoped to this account and the `openivm.org` zone |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID |

Deploying by hand from a laptop still works for the account owner:

```sh
npx wrangler login   # once
npm run deploy       # build + wrangler deploy
```

## Brand

The logo is a delta drawn as a refresh loop: only the last stretch (pink) is redrawn, like an incremental refresh.
SVGs live in [`public/brand/`](public/brand/) and are served from `https://openivm.org/brand/`.

| File | Use |
| --- | --- |
| `openivm-logo.svg` | Mark and wordmark, for dark backgrounds |
| `openivm-logo-light.svg` | Mark and wordmark, for light backgrounds |
| `openivm-mark.svg` | Mark only, for dark backgrounds |
| `openivm-mark-light.svg` | Mark only, for light backgrounds |
| `openivm-icon.svg` | App icon / avatar on its own dark tile |

The wordmark is Inter (600 for "Open", 800 for "IVM"), converted to outlines so it renders without the font.

## Roadmap

- Live benchmark fed by `ivm-bench` (static Parquet, rendered in-browser)
- Spark quickstart and best-practice guides
- Docs / blog section
