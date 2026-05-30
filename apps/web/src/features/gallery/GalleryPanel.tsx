import { eventsForCountry, findMember, groupPhotosByAlbum, type Photo } from '@dap/shared';
import { useMemo, useRef, useState } from 'react';
import { useToast } from '../../components/Toast.js';
import { capturePhoto } from '../../lib/capturePhoto.js';
import { downloadPhoto } from '../../lib/downloadPhoto.js';
import { useRoomStore } from '../../state/roomStore.js';
import { PhotoLightbox } from './PhotoLightbox.js';
import { PhotoThumb } from './PhotoThumb.js';

export function GalleryPanel() {
  const state = useRoomStore((s) => s.state)!;
  const meId = useRoomStore((s) => s.meId);
  const addPhoto = useRoomStore((s) => s.addPhoto);
  const removePhoto = useRoomStore((s) => s.removePhoto);
  const { show } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const photos = state.photos ?? [];
  const albums = useMemo(() => groupPhotosByAlbum(photos), [photos]);
  // Flat, display-ordered list so the lightbox can swipe across albums.
  const flat = useMemo(() => albums.flatMap((a) => a.events.flatMap((e) => e.photos)), [albums]);
  const [tagLocation, setTagLocation] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const openIndex = flat.findIndex((p) => p.id === openId);
  const openPhoto = openIndex >= 0 ? flat[openIndex]! : null;

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clickThumb(p: Photo) {
    if (selectMode) toggleSelected(p.id);
    else setOpenId(p.id);
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      let geo: { lat?: number; lng?: number; country?: string; place?: string } = {};
      const first = Array.from(files).find((f) => f.type.startsWith('image/'));
      if (tagLocation && first) {
        const captured = await capturePhoto(first, true);
        geo = {
          lat: captured.lat,
          lng: captured.lng,
          country: captured.country,
          place: captured.place,
        };
      }
      let added = 0;
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const captured = await capturePhoto(file, false);
        await addPhoto({
          blob: captured.blob,
          width: captured.width,
          height: captured.height,
          ...geo,
        });
        added++;
      }
      if (added > 0) show(`Added ${added} photo${added > 1 ? 's' : ''}`);
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not add photo');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} photo${selected.size > 1 ? 's' : ''} for everyone?`))
      return;
    for (const id of selected) await removePhoto(id);
    setSelected(new Set());
    setSelectMode(false);
  }

  async function bulkDownload() {
    for (const id of selected) {
      const ph = photos.find((p) => p.id === id);
      await downloadPhoto(state.room.slug, id, ph?.caption);
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  if (!meId) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Join the room to add and view shared photos.
        </p>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <div className="card row spread row-wrap" style={{ gap: '0.75rem' }}>
        {selectMode ? (
          <>
            <div className="row row-wrap" style={{ gap: '0.5rem' }}>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setSelectMode(false);
                  setSelected(new Set());
                }}
              >
                Cancel
              </button>
              <button
                className="btn btn-sm"
                disabled={selected.size === 0}
                onClick={() => void bulkDownload()}
              >
                ⬇ Download{selected.size ? ` (${selected.size})` : ''}
              </button>
              <button
                className="btn btn-sm btn-danger"
                disabled={selected.size === 0}
                onClick={() => void bulkDelete()}
              >
                🗑 Delete{selected.size ? ` (${selected.size})` : ''}
              </button>
            </div>
            <span className="muted small">{selected.size} selected</span>
          </>
        ) : (
          <>
            <div className="row row-wrap" style={{ gap: '0.5rem' }}>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                {busy ? 'Adding…' : '📷 Add photos'}
              </button>
              <button
                className={`btn ${tagLocation ? 'btn-primary' : ''}`}
                aria-pressed={tagLocation}
                onClick={() => setTagLocation((v) => !v)}
                title="Geotag new photos so they group into country albums"
              >
                🏷️ {tagLocation ? 'Location on' : 'Location off'}
              </button>
              {photos.length > 0 && (
                <button className="btn" onClick={() => setSelectMode(true)}>
                  ☑️ Select
                </button>
              )}
            </div>
            <span className="muted small">
              {photos.length} photo{photos.length === 1 ? '' : 's'}
            </span>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => void onFiles(e.target.files)}
        />
      </div>

      {photos.length === 0 ? (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No photos yet. Tap “Add photos” to snap one or pick from your device — with location on,
            they’ll group into albums by country.
          </p>
        </div>
      ) : (
        albums.map((album) => (
          <section key={album.country ?? '_none'} className="stack" style={{ gap: '0.6rem' }}>
            <h3 style={{ margin: 0 }}>
              {album.country ? `📍 ${album.country}` : '🗂️ No location'}{' '}
              <span className="muted small">({album.count})</span>
            </h3>
            {album.events.map((group) => (
              <div key={group.event ?? '_untagged'} className="stack" style={{ gap: '0.4rem' }}>
                {(group.event || album.events.length > 1) && (
                  <div className="section-label">{group.event ?? 'Untagged'}</div>
                )}
                <div className="gallery-grid">
                  {group.photos.map((p: Photo) => (
                    <PhotoThumb
                      key={p.id}
                      slug={state.room.slug}
                      photo={p}
                      selectable={selectMode}
                      selected={selected.has(p.id)}
                      onOpen={() => clickThumb(p)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))
      )}

      {openPhoto && (
        <PhotoLightbox
          slug={state.room.slug}
          photo={openPhoto}
          authorName={findMember(state.room, openPhoto.authorId)?.name ?? 'Someone'}
          eventSuggestions={eventsForCountry(photos, openPhoto.country ?? null)}
          onClose={() => setOpenId(null)}
          onPrev={openIndex > 0 ? () => setOpenId(flat[openIndex - 1]!.id) : undefined}
          onNext={
            openIndex < flat.length - 1 ? () => setOpenId(flat[openIndex + 1]!.id) : undefined
          }
        />
      )}
    </div>
  );
}
