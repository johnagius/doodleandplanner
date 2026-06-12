# Roadmap / TODO

Tracked work for Doodle & Planner. Shipped items live on `main` + the deployed
site; this file is the running backlog.

## 📸 Photos & gallery — ✅ done

Let members capture/share photos and browse them as geotagged albums.

- [x] **Storage backend** — photo bytes stored in the per-room Durable Object
      (SQLite BLOBs; no new bindings/permissions), referenced by lightweight
      metadata that syncs in `RoomState`. Client downscales before upload.
      `PUT/GET/DELETE /api/rooms/:slug/photos/:photoId`; `LocalStorageRepository`
      mirrors it with IndexedDB for offline mode.
- [x] **Capture & gallery** — take a photo (device camera via `<input capture>`)
      or pick files; a **Gallery** tab shows photos in a grid with captions,
      author and a lightbox (edit caption/event, delete).
- [x] **Geotag & albums** — geolocation captured at photo time, reverse-geocoded
      to **country** (OSM Nominatim), grouped into albums by country then by
      **event** (user-editable tag). No-location photos land in their own album.
- [x] **Chat integration** — attach a photo to a chat message; thumbnails
      render inline and open in the lightbox, and chat photos also land in the
      gallery (and its country/event albums).

## ⚽ World Cup 2026 predictions — ✅ done

A standalone `/world-cup` board (no login) for predicting the tournament.

- [x] **Engine** (`@dap/shared/worldcup`) — pure, tested tournament model: 48
      teams in 12 groups, 104 fixtures, a fully-wired knockout bracket, group
      standings, best-third ranking, closeness scoring and a leaderboard.
- [x] **Predict & score** — pick a scoreline for every match; points by how
      close (5 exact · 4 right margin · 3 right result · 2/1 near-miss). Picks
      lock at kickoff; the organiser enters results after the game.
- [x] **Auto-populating bracket** — group results feed the standings, which fill
      the Round of 32 → final; clearing a result cascades downstream.
- [x] **UI** — day-by-day fixtures (Malta time) with a live countdown, live group
      tables, a bracket view and a predictors' leaderboard. First-run "Who are
      you?" prompt; names start as John/Daniel/Noel/Saviour with "add name".
- [x] **Live results** — auto-filled from football-data.org via a Worker proxy
      (token kept server-side, cached), plus a 🔴 LIVE badge for in-play games.
- [x] **Hidden picks** — rivals' predictions stay hidden until kickoff, then
      reveal (no copying).
- [x] **Leaderboard glow-up** — rank movement, day champion, recent form, badges
      and head-to-head player comparisons.
- [x] **Banter in the hot zone** — per-match comment threads with emoji reactions
      (the standalone Banter tab is gone), plus "still to predict" prompts and a
      tab-title reminder before matches lock.
- [x] **Engagement on every card** — a crowd pulse ("N of M predicted", then the
      consensus scoreline + a 🎯 closest-pick crown), quick match reactions
      (🔥😱🎉💩), reacting to mates' revealed picks, and team context (group
      position + recent W/D/L form).
- [ ] Strategy layer: a per-matchday joker, knockout multipliers, outright bets.
- [ ] Live match minute (needs a paid football-data tier) and a share card.
- [ ] Let the organiser edit fixtures/teams (currently a fixed 2026 seed).

## Ideas / later

- Optional full-res photos via R2 (needs an R2 bucket + token scope).
- Battleship: drag-to-place (currently tap-to-place with rotate/shuffle).

## Recently done

- Chat: emoji reactions on messages (👍❤️😂🎉😮😢), live-synced.
- Account identity — signed-in members are recognised across devices by Google
  email (one person = one member everywhere), beyond per-device localStorage.
- Map place search (type an address → drop a pin) via Nominatim.
- "Your move" games badge + unread-chat badge + tab-title alerts + toasts.
- Games hub: Connect Four, Reversi, Battleship (with manual placement);
  spectator mode.
- Gallery: multi-select, bulk delete/download, swipe lightbox.

## Done

- Live realtime backend (Cloudflare Worker + SQLite Durable Object, free tier).
- First-run welcome / sign-in modal; persisted Google sign-in across reloads.
- Invite-friends dialog (share sheet, copy, email, reset link).
- Auto-suggested, editable room code on create.
- Party games: Tic-Tac-Toe, Connect Four, Dots & Boxes (2–4 players), live sync.
- Live map: meet-up pins + opt-in live locations (OpenStreetMap).
