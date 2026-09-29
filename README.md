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

```sh
npx wrangler login   # once
npm run deploy       # build + wrangler deploy
```

GitHub Actions (`.github/workflows/ci.yml`) checks that every push builds. To deploy on push instead, connect the
repo under **Workers & Pages → openivm-site → Settings → Builds** in the Cloudflare dashboard.

## Roadmap

- Live benchmark fed by `ivm-bench` (static Parquet, rendered in-browser)
- Spark quickstart and best-practice guides
- Docs / blog section
