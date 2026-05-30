# Roadmap / TODO

Tracked work for Doodle & Planner. Shipped items live on `main` + the deployed
site; this file is the running backlog.

## 📸 Photos & gallery (in progress)

Let members capture/share photos and browse them as geotagged albums.

- [ ] **Storage backend** — store photo bytes in the per-room Durable Object
      (SQLite BLOBs; no new bindings/permissions), referenced by lightweight
      metadata that syncs in `RoomState`. Client downscales before upload.
  - `PUT/GET/DELETE /api/rooms/:slug/photos/:photoId` on the Worker.
  - `LocalStorageRepository` mirrors this with IndexedDB so offline mode works.
- [ ] **Capture & gallery** — take a photo (device camera via
      `<input capture>`) or pick a file; a **Gallery** tab shows the room's
      photos in a grid with captions, author and lightbox view.
- [ ] **Geotag & albums** — capture geolocation at photo time, reverse-geocode
      to **country** (free OSM Nominatim), and group the gallery into albums by
      country. Within a country, group by **event** (user-editable tag) — e.g.
      "Malta" → "Beach day". City-level precision not required. Photos without a
      location land in an "Unsorted" album.
- [ ] **Chat integration** — attach a photo to a chat message; render
      thumbnails inline, click to open in the gallery lightbox.

## Ideas / later

- More games (e.g. Battleship, Reversi); spectator mode.
- Map: place search (Nominatim geocoding) to drop a pin by address.
- "Your turn" / activity notifications (games + polls) via a tab badge.
- Persistent, multi-device member identity beyond per-device localStorage.

## Done

- Live realtime backend (Cloudflare Worker + SQLite Durable Object, free tier).
- First-run welcome / sign-in modal; persisted Google sign-in across reloads.
- Invite-friends dialog (share sheet, copy, email, reset link).
- Auto-suggested, editable room code on create.
- Party games: Tic-Tac-Toe, Connect Four, Dots & Boxes (2–4 players), live sync.
- Live map: meet-up pins + opt-in live locations (OpenStreetMap).
