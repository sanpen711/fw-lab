# Browser client

The browser client uses the published Windows frontend's business modules and visual
components. `scripts/build-web.mjs` creates a disposable `.web-stage` from those
sources and applies the explicit browser adaptations in `adapt-source.mjs`.
Windows source files and release versions are not modified by this build.

Browser adaptations provide optional sign-in, existing web session compatibility,
normal browser routes/back/refresh, payment popup handling, and browser settings.
The original mobile PWA remains at `/app/`; phone visits continue to use that entry.
NES is excluded from the browser game catalog and build assets.

Public reads: posts, polls, archive, game rooms, published announcements/activities,
active membership plans, and active products. Personal messages, chat rooms,
membership data, and orders retain their original authenticated permissions.
All mutations still require the existing server-side authentication and policies.

Build and stage the complete deployment:

```sh
npm --prefix desktop-v11 ci
node scripts/build-web.mjs
node scripts/prepare-web-site.mjs
desktop-v11/node_modules/.bin/playwright test --config web-client/playwright.config.ts
```

Pages deploys `.site` only after the browser checks pass. Original root HTML files
remain as legacy source; the deployment replaces user-facing desktop routes with
the built client. Privacy, static downloads, and mobile assets are preserved.
`FW_WEB_QA_SKIP_DOWNLOADS=1` is only for local sparse checkouts without downloads.
