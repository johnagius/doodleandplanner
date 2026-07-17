# CLAUDE.md

Guidance for Claude when working in this repository.

## Working agreement (owner's instructions)

- **This project's production is in Claude's hands.** Improve it continuously:
  add features, harden, polish, keep it deployable.
- **Always push straight to `main` — every commit, no exceptions.** The owner has
  given standing permission; never pause to ask or park work on a feature branch.
  Small, focused, descriptive commits, pushed immediately. Pushing to `main` **is**
  the deploy (see Deployment), so a change isn't done until it's on `main`.
- **Never break `main`.** Every commit must pass the full quality gate below.
- **Test everything** along the way — Vitest (unit/component), Playwright
  (E2E + `@smoke`). New behaviour ⇒ new tests.
- Keep the README and this file current as the system evolves.

## What this is

**Doodle & Planner** — plan get-togethers with friends: scheduling polls
(Doodle-style voting), a shared drawing doodle, Google Calendar availability +
event creation, an inventory checklist with cost-splitting, an activities board
with an itinerary, multiplayer party games (Tic-Tac-Toe, Connect Four, Reversi, Battleship, Dots &
Boxes) with spectating, a
shared photo gallery with geotagged albums, and a live map of meet-up points
with opt-in live locations. Rooms are shareable via
invite link and can be password protected, and sync live across devices through
the Worker when configured.

There is also a standalone **Club Football predictions** board at `/club` (no
login): friends predict every game a fixed set of ten clubs play — across their
league, domestic cups and Europe — via three markets per fixture (Result 1/X/2,
Over/Under 2.5 goals, both-teams-to-score). Fixtures are **automatic**: the
Worker pulls each competition's ESPN scoreboard for a rolling upcoming window
(`/api/football/club-fixtures`) and the pure reconciler `syncClubFeed` in
`packages/shared/src/clubleague.ts` adds/updates/prunes them and auto-fills
results; the organiser only overrides edge cases (e.g. an extra-time cup tie).
The season runs in periods with League 1 / League 2 promotion-relegation and a
top-3 Champions Run-In finale. It lives in a single well-known room (slug
`club-league`) under `RoomState.clubLeague`; UI in `apps/web/src/features/clubleague`.

There is also a standalone **World Cup 2026 predictions** board at `/world-cup`
(no login): friends predict every match scoreline and earn points by how close
they are; the knockout bracket auto-populates from group results. It lives in a
single well-known room (slug `world-cup`) under `RoomState.worldCup`, so it
reuses the same persistence + realtime sync as everything else. Domain logic is
in `packages/shared/src/worldcup.ts`; the UI is in `apps/web/src/features/worldcup`.

## Monorepo layout

```
packages/shared   Pure, serialisable domain logic (no UI/IO). Runs in browser AND on the edge.
apps/web          React + Vite SPA. Talks only to a Repository interface.
apps/server       Cloudflare Worker + Durable Object (one per room) for real-time sync.
```

- `apps/web` storage backends (`src/lib/storage`): `LocalStorageRepository`
  (default; offline, cross-tab) and `HttpRepository` (REST + WebSocket to the
  Worker). `getRepository()` picks `HttpRepository` when `VITE_API_BASE` is set.
- The same `@dap/shared` model is used by the web app and the Worker.

## Commands

```bash
npm install
npm run dev                 # web app at http://localhost:5173
npm run test                # all Vitest suites (shared + server + web)
npm run test:unit           # shared + server + web unit/component (CI gate)
npm run test:e2e            # Playwright (needs: npm run test:e2e:install once)
npm run test:smoke          # @smoke-tagged Playwright subset
npm run typecheck           # tsc across all workspaces
npm run lint                # ESLint
npm run format              # Prettier write  (format:check to verify)
npm run build               # build @dap/shared then the web app
```

## Quality gate — run before every commit to `main`

```bash
npm run format:check && npm run lint && npm run typecheck && npm run test:unit && npm run build
```

Run `npm run test:e2e` when touching UI flows. Playwright needs Chromium
(`npm run test:e2e:install`); it runs against the dev server.

## Conventions

- TypeScript everywhere, ESM. Imports use explicit `.js` extensions (Bundler
  resolution) — match the existing style.
- Domain functions in `@dap/shared` are **pure and immutable** (return new
  objects); the store/UI never mutates state in place.
- Dates are ISO-8601 strings (UTC). Vitest runs with `TZ=UTC` so time-dependent
  tests are deterministic — keep that.
- Web Crypto is accessed via `webCrypto()` in `@dap/shared/ids` so the code
  type-checks under DOM, Node and Cloudflare Workers lib sets.
- Keep `@dap/shared` free of any UI/storage/runtime dependency.

## Deployment

- **Cloudflare Pages (recommended):** connect the repo as a Pages project — build
  command `npm run build`, output dir `apps/web/dist`, Node 20 (`.nvmrc`). Serves
  at root (no base path); `apps/web/public/_redirects` handles SPA routing.
- **GitHub Pages:** `.github/workflows/deploy.yml` builds on push to `main` with
  `VITE_BASE_PATH=/doodleandplanner/` and publishes `apps/web/dist`. One-time:
  set **Settings → Pages → Source: GitHub Actions** (NOT "Deploy from a branch",
  which just renders the README).
- **Google Calendar (optional):** repo variable `GOOGLE_CLIENT_ID`.
- **Cloudflare Worker (optional, real-time):** `cd apps/server && npx wrangler
deploy`, then set repo variable `API_BASE` to the Worker URL so the Pages
  build wires the realtime backend in.
- **Publishing to `doodleandplanner.pages.dev`:** either set the GitHub Actions
  secrets `CLOUDFLARE_API_TOKEN` (Pages: Edit) + `CLOUDFLARE_ACCOUNT_ID` so
  `deploy-cloudflare.yml` auto-deploys on every push to `main`, or run a one-off
  `npm run build && npx wrangler pages deploy apps/web/dist --project-name
doodleandplanner --branch main`. The realtime Worker URL is committed in
  `apps/web/.env.production`, so builds keep live sync. **Never** commit token
  values. The owner manages and rotates their own API tokens — do **not** prompt
  them to rotate secrets.
- `.github/workflows/ci.yml` runs lint/typecheck/unit/build + Playwright E2E on
  PRs and pushes to `main`.
- **What actually serves `doodleandplanner.pages.dev`, and how to know a deploy is
  live:** production is built by the Cloudflare Pages **Git integration** (auto-builds
  on push to `main`), **not** by `deploy-cloudflare.yml`. That Action is gated on the
  `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` secrets and **skips cleanly when they
  are unset**, so a green "Deploy to Cloudflare Pages" run is usually a _skip, not a
  deploy_. Production goes live a minute or two **after** the push, once Cloudflare's
  own build finishes — **the GitHub checkmark does not mean it's live.** Verify with
  the **build stamp** in the app footer (the World Cup page shows `build <sha> · <time>`,
  linking to the commit): it's baked in at build time from `CF_PAGES_COMMIT_SHA`
  (Cloudflare) / `GITHUB_SHA` (Actions) / `dev` (local) via `vite.config.ts`. When the
  stamp shows the latest `main` SHA, that build is live. Scripted check: fetch the site,
  read the `assets/index-*.js` it references, and grep that bundle for a string from
  your change.

## Testing map

- `packages/shared/test/*` — domain unit tests.
- `apps/server/test/*` — router + room service unit tests (pure logic).
- `apps/web/src/**/*.test.ts(x)` — storage/state/format unit + component tests.
- `apps/web/e2e/*.spec.ts` — Playwright journeys; `smoke.spec.ts` is `@smoke`.
