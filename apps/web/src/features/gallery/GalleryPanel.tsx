import { eventsForCountry, findMember, groupPhotosByAlbum, type Photo } from '@dap/shared';
import { useMemo, useRef, useState } from 'react';
import { useToast } from '../../components/Toast.js';
import { reverseGeocode, getCurrentPosition } from '../../lib/geocode.js';
import { downscaleImage } from '../../lib/image.js';
import { useRoomStore } from '../../state/roomStore.js';
import { PhotoThumb } from './PhotoThumb.js';
import { PhotoLightbox } from './PhotoLightbox.js';

export function GalleryPanel() {
  const state = useRoomStore((s) => s.state)!;
  const meId = useRoomStore((s) => s.meId);
  const addPhoto = useRoomStore((s) => s.addPhoto);
  const { show } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const photos = state.photos ?? [];
  const albums = useMemo(() => groupPhotosByAlbum(photos), [photos]);
  const [tagLocation, setTagLocation] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const openPhoto = photos.find((p) => p.id === openId) ?? null;

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      // Resolve location once per batch (all photos taken "here").
      let geo: { lat?: number; lng?: number; country?: string; place?: string } = {};
      if (tagLocation) {
        try {
          const pos = await getCurrentPosition();
          geo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const place = await reverseGeocode(geo.lat!, geo.lng!);
          geo = { ...geo, ...place };
        } catch {
          show('Could not tag location — adding without it');
        }
      }
      let added = 0;
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const { blob, width, height } = await downscaleImage(file);
        await addPhoto({ blob, width, height, ...geo });
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
        <span className="muted small">
          {photos.length} photo{photos.length === 1 ? '' : 's'}
        </span>
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
                      onOpen={() => setOpenId(p.id)}
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
        />
      )}
    </div>
  );
}
