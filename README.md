# DNA Esports Companion

A personal companion tool for the **DNA Racing Pro League** — live standings, team
roster lookup, and a map-fit calculator to help with veto/pick strategy.

Next.js 14 (App Router) + TypeScript + Tailwind. No database, no auth — this is a v1
scaffold meant to be built on.

## What's real vs. manual

- **Standings** and **Teams** pages pull live from the DNA Racing esports API
  (`https://api.dnaracing.run/fbike/esports/*`) — confirmed working endpoints for
  `standings`, `teams`, and `cores_by_hids`.
- **Map Fit** page uses the real, fixed 42-race sequences for all 4 maps (scraped
  from `esports.dnaracing.run/maps`, hardcoded in `lib/mapData.ts` since the site
  says they never change) — but core win-rate % is **manual entry** for now,
  saved to your browser's local storage. No confirmed API endpoint was found for
  per-core esports win rates; the site's own Core Stats page most likely computes
  these client-side from raw race history. Worth investigating further if you want
  this to auto-populate.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Deploying to Vercel

1. Push this repo to GitHub (new repo, e.g. `DNA-Esports`).
2. Go to https://vercel.com/new, import the repo.
3. Framework preset: Vercel auto-detects Next.js — no config needed.
4. No environment variables are required for v1 (the API calls are unauthenticated,
   same as the public site).
5. Deploy. Every push to `main` will auto-deploy.

## Known gaps / next steps

- **Schedule/fixtures**: no confirmed API endpoint yet. The site's `/schedule` page
  likely calls something not yet identified — worth re-probing with browser
  devtools network tab while that page is open.
- **Per-core esports win rates**: not confirmed as an API. Likely derived from
  `/fbike/i/hraces` (the same race-history endpoint DNA-Analytics uses), filtered
  down to esports/league races somehow — would need reverse-engineering the site's
  client-side computation to auto-populate the Map Fit calculator instead of manual
  entry.
- **Distance-bracket nuance**: the Map Fit score currently ignores the 7 distance
  brackets the site tracks separately (1000-2200m). It's a first-pass model.
- No auth/wallet connect — the real site supports wallet login to see "your" team;
  this scaffold treats all teams as public/read-only.
