# Browser client

The browser client uses the published Windows frontend's business modules and visual
components. `scripts/build-web.mjs` creates a disposable `.web-stage` from those
sources and applies the explicit browser adaptations in `adapt-source.mjs`.
Windows source files and release versions are not modified by this build.

Browser adaptations provide optional sign-in, existing web session compatibility,
normal browser routes/back/refresh, payment popup handling, and browser settings.
The browser shell has its own horizontal site navigation, centered content,
short page descriptions, document scrolling, and shared footer in `web.css`. Interactive
two-column panels remain bounded within the page. The native sidebar and
full-window layout are not used on the website. Layout changes belong only in
`web-client/`, so the Windows application keeps its existing presentation.
The original mobile PWA remains at `/app/`; phone visits continue to use that entry.
NES is excluded from the browser game catalog and build assets.

Guests can browse only home and the public square feed. They see post content and
comment counts; comment text, private square tabs, profiles, and all other sections
require verified sign-in. Guests can enter each restricted section: its URL and
navigation selection update, while its contents are replaced by a centered
registration/login message and button. No section data is loaded. Direct routes,
aliases, refresh and history show the same gate. Only clicking a login entry opens
the account dialog; sign-in then loads the current section. Cancelling leaves the
gate visible. Public square/home navigation remains available. Privacy and downloads
stay public.

Guest comment counts use `fw_public_post_comment_counts` (up to 100 visible posts).
Anonymous comment reads are restricted to the RLS-protected `post_id` column; no
comment body, author, ID, or timestamp is returned. Guest caches use a new namespace
and do not reuse older public caches containing comments. Signed-in permissions stay
unchanged. Published home announcements and activity summaries remain readable.

Roll out the migrations in two stages: add `web_public_post_comment_counts` before
deploying the frontend, then apply `web_guest_post_only_access` after the new version
is live. Run `supabase/tests/web-guest-post-only.sql` to verify anonymous counts and
permissions without writing application data.

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
