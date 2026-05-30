import type { Photo } from '@dap/shared';
import { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal.js';
import { downloadPhoto } from '../../lib/downloadPhoto.js';
import { usePhotoUrl } from '../../lib/usePhotoUrl.js';
import { useRoomStore } from '../../state/roomStore.js';

export function PhotoLightbox({
  slug,
  photo,
  authorName,
  eventSuggestions,
  onClose,
  onPrev,
  onNext,
}: {
  slug: string;
  photo: Photo;
  authorName: string;
  eventSuggestions: string[];
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const url = usePhotoUrl(slug, photo.id);
  const editPhoto = useRoomStore((s) => s.editPhoto);
  const removePhoto = useRoomStore((s) => s.removePhoto);
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [event, setEvent] = useState(photo.event ?? '');

  // Re-sync the editable fields when navigating to another photo.
  useEffect(() => {
    setCaption(photo.caption ?? '');
    setEvent(photo.event ?? '');
  }, [photo.id, photo.caption, photo.event]);

  // Arrow-key navigation between photos.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
      if (e.key === 'ArrowRight' && onNext) onNext();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onPrev, onNext]);

  const dirty = caption !== (photo.caption ?? '') || event !== (photo.event ?? '');
  const save = () => editPhoto(photo.id, { caption, event });
  const location = [photo.place, photo.country].filter(Boolean).join(', ');

  return (
    <Modal open onClose={onClose} title="Photo">
      <div className="lightbox">
        <div className="lightbox-stage">
          {onPrev && (
            <button className="lightbox-nav prev" onClick={onPrev} aria-label="Previous photo">
              ‹
            </button>
          )}
          {url ? (
            <img className="lightbox-img" src={url} alt={photo.caption ?? ''} />
          ) : (
            <div className="lightbox-img lightbox-loading" aria-hidden />
          )}
          {onNext && (
            <button className="lightbox-nav next" onClick={onNext} aria-label="Next photo">
              ›
            </button>
          )}
        </div>

        <div className="stack" style={{ gap: '0.6rem' }}>
          <label className="field">
            Caption
            <input
              className="input"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Say something about this photo"
              onBlur={() => dirty && void save()}
            />
          </label>
          <label className="field">
            Event tag <span className="muted small">(groups within the album)</span>
            <input
              className="input"
              list="dap-event-tags"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
              placeholder="Beach day, Old town…"
              onBlur={() => dirty && void save()}
            />
            <datalist id="dap-event-tags">
              {eventSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>

          <div className="row spread row-wrap" style={{ gap: '0.5rem' }}>
            <span className="muted small">
              by {authorName}
              {location ? ` · ${location}` : ''}
            </span>
            <div className="row" style={{ gap: '0.4rem' }}>
              {dirty && (
                <button className="btn btn-sm btn-primary" onClick={() => void save()}>
                  Save
                </button>
              )}
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => void downloadPhoto(slug, photo.id, photo.caption)}
              >
                ⬇ Download
              </button>
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  if (confirm('Delete this photo for everyone?')) {
                    void removePhoto(photo.id);
                    onClose();
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
