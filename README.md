# Doodle &amp; Planner ✏️🗓️

Plan events with friends — find a time, sketch ideas together, and sort out the
details. It combines a **scheduling poll** (vote on times, Doodle-style), a
**shared drawing doodle**, **Google Calendar** availability + event creation, an
**inventory checklist** ("who brings what"), and an **activities** board ("what
shall we do").

Rooms are shareable via an invite link and can be **password protected**.

> Status: actively being built. The app runs **fully client-side** today (works
> on GitHub Pages with `localStorage`), and is architected so the same domain
> logic can run in a **Cloudflare Worker + Durable Objects** backend for true
> real-time, multi-device collaboration.

## Features

- **Rooms** with a short shareable code, secret invite link (rotatable), and
  optional password protection (PBKDF2 via Web Crypto).
- **Scheduling polls** — propose time options, everyone votes 👍/🤔/👎, a
  weighted tally surfaces the best slot, and the organiser can lock it in. Connect
  Google Calendar to **overlay each member's free/busy** on every option.
- **Shared doodle** — a collaborative drawing canvas with a colour palette,
  brush sizes and per-member undo.
- **Plan** — finalised events, exportable as `.ics`, or pushed straight to
  Google Calendar.
- **Google Calendar** — connect to read your free/busy and auto-suggest times
  you're free, and write the agreed event back to your calendar.
- **Inventory** — a checklist of what to bring with claim/coverage tracking, plus
  optional per-item **costs** that split fairly across the group with a minimal
  "who pays whom" settle-up (pick your currency).
- **Activities** — propose things to do, vote with interest, and auto-build a
  timed **itinerary / running order** for the day.
- **Discussion** — a per-room chat thread for the group.
- **Anywhere** — installable **PWA** (works offline), light/dark theme, and
  **export/import** a room as JSON to back up or move between devices.

## Monorepo layout

```
packages/shared   Framework-agnostic domain logic (pure, serialisable, unit-tested)
apps/web          React + Vite front-end (the deployable app)
apps/server       Cloudflare Worker + Durable Object for real-time room sync
```

- `@dap/shared` holds all the rules — rooms, voting tallies, availability/slot
  finding, inventory, budget split, activities, itinerary, events, the doodle
  board, password hashing and invite tokens — with no UI or storage
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

### Cloudflare Pages

Build command `npm run build`, output directory `apps/web/dist`. The included
`_redirects` file serves the SPA.

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
