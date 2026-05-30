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

## Ideas / later

- Optional full-res photos via R2 (needs an R2 bucket + token scope).
- Battleship: drag-to-place (currently tap-to-place with rotate/shuffle).

## Recently done

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
