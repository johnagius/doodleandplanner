# Doodle &amp; Planner ✏️🗓️

Plan events with friends — find a time, sketch ideas together, play a game while
you wait, and sort out the details. It combines a **scheduling poll** (vote on
times, Doodle-style), a **shared drawing doodle**, **Google Calendar**
availability + event creation, an **inventory checklist** ("who brings what"), an
**activities** board, **multiplayer party games**, and a **live map** of where
you're meeting.

Rooms are shareable via an invite link and can be **password protected**. There's
also a standalone **⚽ World Cup 2026 predictions** board (`/world-cup`) where
friends predict every scoreline — no login — and score points for how close they
get.

**▶︎ Live: https://doodleandplanner.pages.dev**

> Status: actively being built — and now **live multi-device**. Rooms sync in
> real time through a **Cloudflare Worker + SQLite Durable Object** (one per
> room) over REST + WebSocket; the app still falls back to a fully client-side
> `localStorage` mode when no backend is configured.

## Features

- **Rooms** with a short shareable code, secret invite link (rotatable), and
  optional password protection (PBKDF2 via Web Crypto).
- **Welcome & sign-in** — a reliable first-run modal greets new visitors with
  one-click **Sign in with Google** (no scary scopes) or "continue as guest".
- **Invite friends** — an invite dialog with the native **share sheet** (Web
  Share API), copy link, and prefilled **email invite** — no contacts access.
- **World Cup predictions** — a dedicated `/world-cup` board (no login) where
  friends predict every match scoreline, in **Malta time**. Each fixture is laid
  out day by day with a **live countdown**; picks **lock at kickoff** and rivals'
  predictions stay **hidden until then**. Points are awarded by how close each
  guess was (exact score scores most, right margin next, right result next, then a
  consolation for being a goal or two off). **Results auto-fill from a live feed**
  (football-data.org) so no one has to enter them. Group standings compute
  automatically and, once the groups finish, the **knockout bracket populates
  itself** (Round of 32 → final). The **leaderboard** shows rank movement, the
  day's top scorer, recent form, badges and head-to-head comparisons. Every match
  card has a **three-view switcher**: **Match** (a **crowd pulse**, a 🎯
  closest-pick crown, **quick reactions** 🔥😱🎉💩, reactions to friends' revealed
  picks, and **per-match banter**), **Stats** (FIFA ranking, the two teams' form &
  record side-by-side — goals for/against per game, clean sheets — plus
  **historical head-to-head** from the live feed), and **Group** (the live
  standings with **qualification permutations** — what each team's remaining games
  can still produce: through / in the hunt / 3rd-place hopeful / out). There's also
  a **🏆 predict-the-winner** game: pick who lifts the trophy (locks at the
  knockouts) and bank points that grow with your team's run. Gentle "still to
  predict" nudges keep everyone on track.
  Everyone shares one board through the realtime Worker (with a graceful local
  fallback). A first-run "Who are you?" prompt remembers you on the device.
- **Party games** — a **Games** lobby with live, turn-based **Tic-Tac-Toe**,
  **Connect Four**, **Reversi**, **Battleship** and **Dots & Boxes (2–4
  players)** that sync across devices in real time, with a "your move" badge,
  spectating, and rematches.
- **Live map** — drop shared **meet-up pins** (with a time, note and directions)
  on an OpenStreetMap, and **opt in to share your live location** with the group
  (ephemeral, never stored).
- **Scheduling polls** — propose time options, everyone votes 👍/🤔/👎, a
  weighted tally surfaces the best slot, and the organiser can lock it in. Connect
  Google Calendar and a **smart, conflict-aware overlay** shows who's free vs who
  **can't make it and why** — naming the clashing event ("Alex: Dentist") and
  treating tentative/incidental overlaps as soft warnings rather than vetoes.
- **Shared doodle** — a collaborative canvas with pen, **shapes** (line, rect,
  ellipse), an eraser, **draggable sticky notes**, a colour palette, per-member
  undo, and **live cursors** (across tabs locally; across devices via the Worker).
- **Plan** — finalised events with **RSVP / headcount** (going / maybe / can't),
  exportable as `.ics`, or pushed straight to Google Calendar.
- **Sign in with Google** — one click brings your name + avatar; the app reads
  your free/busy to suggest times and writes the agreed event back.
- **Inventory** — a checklist of what to bring, grouped by category, with
  claim/coverage tracking.
- **Money & split** — log shared **expenses** (paid by one, split across the
  group) alongside item costs, and get a minimal **"who pays whom"** settle-up
  in your currency.
- **Activities** — propose things to do, vote with interest, and auto-build a
  timed **itinerary / running order** for the day.
- **Discussion** — a per-room chat thread with photo sharing and emoji reactions.
- **Templates** — start a room pre-filled for a Camping trip, Birthday, Dinner
  party, Game night or City break (or blank).
- **Trip summary** — a shareable, printable one-pager pulling together the
  agreed plan, RSVPs, activities, packing list and the money settle-up.
- **Anywhere** — installable **PWA** (works offline), a **WebGL** animated hero,
  light/dark theme, owner **room settings** (working hours feed the slot finder),
  and **export/import** a room as JSON to back up or move between devices.

## Monorepo layout

```
packages/shared   Framework-agnostic domain logic (pure, serialisable, unit-tested)
apps/web          React + Vite front-end (the deployable app)
apps/server       Cloudflare Worker + Durable Object for real-time room sync
```

- `@dap/shared` holds all the rules — rooms, voting tallies, availability/slot
  finding, the conflict engine, inventory, the expenses ledger + settle-up,
  activities, itinerary, events + RSVP, the doodle board, room templates, schema
  migrations, password hashing and invite tokens — with no UI or storage
  dependencies. This is why it can run in the browser or on the edge unchanged.
- `apps/web` talks to a `Repository` interface (`src/lib/storage`). The default
  `LocalStorageRepository` persists to the browser and syncs across tabs; the
  `HttpRepository` (REST + WebSocket) talks to the Worker for true multi-device
  collaboration — selected automatically when `VITE_API_BASE` is set.
- `apps/server` is the Cloudflare Worker. Each room is a **Durable Object** that
  owns the canonical state and fans every change out to connected clients over
  WebSockets. It reuses `@dap/shared`, so the front-end and edge share one model.

## Getting started

```bash
npm install
npm run dev            # start the web app at http://localhost:5173
```

## Scripts

| Command                           | What it does                             |
| --------------------------------- | ---------------------------------------- |
| `npm run dev`                     | Run the web app in dev mode              |
| `npm run build`                   | Build `@dap/shared` then the web app     |
| `npm run test`                    | Run all Vitest suites (shared + web)     |
| `npm run test:e2e`                | Run Playwright end-to-end tests          |
| `npm run test:smoke`              | Run the tagged `@smoke` Playwright tests |
| `npm run typecheck`               | Type-check every workspace               |
| `npm run lint` / `npm run format` | ESLint / Prettier                        |

## Testing

- **Vitest** covers the domain (`packages/shared`) and the app's storage, state
  store and a UI integration test (`apps/web`).
- **Playwright** drives real user journeys (create a room, run a poll, manage
  inventory and activities, draw on the doodle, add an event), plus a `@smoke`
  subset for quick health checks.

```bash
npm run test                                   # unit + component
npm run test:e2e:install --workspace @dap/web  # one-time: install Chromium
npm run test:e2e                               # end-to-end
```

## Google Calendar setup

Calendar integration uses Google Identity Services directly from the browser, so
no server secret is required. Provide an OAuth **Client ID** at build time:

```bash
VITE_GOOGLE_CLIENT_ID="<your-oauth-client-id>" npm run build
```

Create the client in Google Cloud Console (OAuth client → Web application), add
your deployed origin to the authorised JavaScript origins, and enable the Google
Calendar API. Without a client ID the app still works — events can be exported as
`.ics` files.

## Deployment

### GitHub Pages

`/.github/workflows/deploy.yml` builds with `VITE_BASE_PATH=/doodleandplanner/`
and publishes `apps/web/dist`. In the repo settings, set **Pages → Source** to
**GitHub Actions**. A `404.html` fallback makes client-side routing work on
project sites. Optionally set a repository variable `GOOGLE_CLIENT_ID` to enable
calendar features on the deployed site.

### Cloudflare Pages (recommended)

Connect this repo as a Cloudflare **Pages** project (Workers & Pages → Create →
Pages → Connect to Git) with:

| Setting                | Value                    |
| ---------------------- | ------------------------ |
| Framework preset       | None                     |
| Build command          | `npm run build`          |
| Build output directory | `apps/web/dist`          |
| Root directory         | `/` (repo root)          |
| Node version           | 20 (pinned via `.nvmrc`) |

It serves at the project root, so no base path is needed, and the bundled
`_redirects` (`/* /index.html 200`) makes client-side routing work. Optional
environment variables: `VITE_GOOGLE_CLIENT_ID` (Calendar) and `VITE_API_BASE`
(the real-time Worker URL). Every push to `main` then auto-deploys.

For a one-off manual deploy instead: `npm run build` then
`npx wrangler pages deploy apps/web/dist --project-name doodleandplanner`.

### Cloudflare Worker (real-time backend)

For true multi-device rooms (everyone sees changes live), deploy the Worker:

```bash
cd apps/server
npx wrangler deploy        # first run: npx wrangler login
```

This provisions the `RoomDurableObject` (one instance per room) behind a URL
like `https://doodleandplanner-api.<account>.workers.dev`. Then build the
front-end pointing at it:

```bash
VITE_API_BASE="https://doodleandplanner-api.<account>.workers.dev" npm run build
```

or set an `API_BASE` repository variable so the GitHub Pages workflow wires it
in automatically. With `VITE_API_BASE` unset the app stays fully client-side.
Lock down `ALLOWED_ORIGINS` in `apps/server/wrangler.toml` to your site origins.

## Roadmap

- Server-verified passwords/invites and live cursors on the doodle.
- Per-member calendar overlay so polls show everyone's availability at a glance.
- Recurring events and richer activity scheduling.
