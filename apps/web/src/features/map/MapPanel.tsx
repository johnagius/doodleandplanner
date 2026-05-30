import { directionsUrl, findMember, initials, sortMeetPoints, type MeetPoint } from '@dap/shared';
import type * as Leaflet from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '../../components/Toast.js';
import { forwardGeocode, type GeoResult } from '../../lib/geocode.js';
import {
  applyPresence,
  isLivePresence,
  prunePresence,
  type LivePresence,
  type PresenceMap,
} from '../../lib/geoPresence.js';
import { getRepository } from '../../lib/storage/index.js';
import { useRoomStore } from '../../state/roomStore.js';

function fmtTime(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    day: 'numeric',
    month: 'short',
  });
}

/** HTML for a teardrop meet-point pin in the given colour. */
function pinHtml(color: string, label: string): string {
  return `<div class="map-pin" style="--pin:${color}" title="${label.replace(/"/g, '&quot;')}"><span>📍</span></div>`;
}
function liveHtml(color: string, name: string): string {
  return `<div class="map-live" style="--live:${color}"><span>${initials(name)}</span></div>`;
}

export function MapPanel() {
  const state = useRoomStore((s) => s.state)!;
  const meId = useRoomStore((s) => s.meId);
  const addMeetPoint = useRoomStore((s) => s.addMeetPoint);
  const removeMeetPoint = useRoomStore((s) => s.removeMeetPoint);
  const { show } = useToast();

  const points = useMemo(() => sortMeetPoints(state.meetPoints ?? []), [state.meetPoints]);
  const me = meId ? findMember(state.room, meId) : undefined;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const LRef = useRef<typeof Leaflet | null>(null);
  const meetLayer = useRef<Leaflet.LayerGroup | null>(null);
  const liveLayer = useRef<Leaflet.LayerGroup | null>(null);
  const addingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(null);
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('');
  const [sharing, setSharing] = useState(false);
  const [live, setLive] = useState<PresenceMap>({});
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);

  addingRef.current = adding;

  // Initialise the Leaflet map once (lazy-loaded so it never runs in tests).
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const L = (await import('leaflet')).default;
      if (disposed || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, { zoomControl: true }).setView([30, 0], 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);
      meetLayer.current = L.layerGroup().addTo(map);
      liveLayer.current = L.layerGroup().addTo(map);
      map.on('click', (e: Leaflet.LeafletMouseEvent) => {
        if (addingRef.current) {
          setPending({ lat: e.latlng.lat, lng: e.latlng.lng });
          setAdding(false);
        }
      });
      mapRef.current = map;
      setReady(true);
      // Ensure correct sizing once the tab's enter animation settles.
      setTimeout(() => map.invalidateSize(), 300);
    })();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Keep the map correctly sized when its container resizes.
  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [ready]);

  // Render meet-point markers whenever they change.
  useEffect(() => {
    const L = LRef.current;
    const layer = meetLayer.current;
    const map = mapRef.current;
    if (!L || !layer || !map) return;
    layer.clearLayers();
    for (const p of points) {
      const icon = L.divIcon({
        className: 'map-pin-wrap',
        html: pinHtml('#6366f1', p.label),
        iconSize: [30, 38],
        iconAnchor: [15, 36],
      });
      const marker = L.marker([p.lat, p.lng], { icon }).addTo(layer);
      marker.bindPopup(
        `<strong>${p.label}</strong>${p.time ? `<br>${fmtTime(p.time)}` : ''}` +
          `${p.note ? `<br>${p.note}` : ''}` +
          `<br><a href="${directionsUrl(p)}" target="_blank" rel="noreferrer">Directions ↗</a>`,
      );
    }
    if (points.length > 0 && ready) {
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
      map.fitBounds(bounds.pad(0.3), { maxZoom: 15 });
    }
  }, [points, ready]);

  // Render live member-location markers when presence updates.
  useEffect(() => {
    const L = LRef.current;
    const layer = liveLayer.current;
    if (!L || !layer) return;
    layer.clearLayers();
    for (const p of Object.values(live)) {
      const icon = L.divIcon({
        className: 'map-live-wrap',
        html: liveHtml(p.color, p.name),
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([p.lat, p.lng], { icon }).addTo(layer).bindPopup(`${p.name} (live)`);
    }
  }, [live]);

  // Subscribe to live presence; prune stale markers periodically.
  useEffect(() => {
    const repo = getRepository();
    if (!repo.subscribePresence) return;
    const unsub = repo.subscribePresence(state.room.slug, (payload) => {
      if (isLivePresence(payload) && payload.memberId !== meId) {
        setLive((m) => applyPresence(m, payload));
      }
    });
    const interval = window.setInterval(() => setLive((m) => prunePresence(m, Date.now())), 5000);
    return () => {
      unsub();
      window.clearInterval(interval);
    };
  }, [state.room.slug, meId]);

  // Broadcast my own location while sharing is on.
  useEffect(() => {
    if (!sharing || !me) return;
    const repo = getRepository();
    if (!navigator.geolocation || !repo.publishPresence) {
      show('Live location is not available on this device');
      setSharing(false);
      return;
    }
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        const frame: LivePresence = {
          kind: 'geo',
          memberId: me.id,
          name: me.name,
          color: me.color,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          at: Date.now(),
        };
        repo.publishPresence?.(state.room.slug, frame);
        mapRef.current?.setView([frame.lat, frame.lng], Math.max(mapRef.current.getZoom(), 14));
      },
      () => {
        show('Could not get your location — permission denied?');
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [sharing, me, state.room.slug, show]);

  async function savePending(e: React.FormEvent) {
    e.preventDefault();
    if (!pending || !label.trim()) return;
    await addMeetPoint({
      label,
      lat: pending.lat,
      lng: pending.lng,
      time: time ? new Date(time).toISOString() : undefined,
    });
    setPending(null);
    setLabel('');
    setTime('');
  }

  function centerOn(p: MeetPoint) {
    mapRef.current?.setView([p.lat, p.lng], 16);
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const found = await forwardGeocode(query);
      setResults(found);
      if (found.length === 0) show('No places found — try a different search');
    } finally {
      setSearching(false);
    }
  }

  function pickResult(r: GeoResult) {
    mapRef.current?.setView([r.lat, r.lng], 15);
    setPending({ lat: r.lat, lng: r.lng });
    setLabel(r.label.split(',')[0] ?? r.label);
    setResults([]);
    setQuery('');
    setAdding(false);
  }

  if (!meId) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Join the room to drop meet-up pins and share your live location.
        </p>
      </div>
    );
  }

  return (
    <div className="map-layout">
      <div className="map-side stack" style={{ gap: '0.75rem' }}>
        <form className="map-search" onSubmit={runSearch}>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a place or address…"
            aria-label="Search for a place"
          />
          <button className="btn btn-sm" type="submit" disabled={searching || !query.trim()}>
            {searching ? '…' : '🔍'}
          </button>
        </form>
        {results.length > 0 && (
          <ul className="map-results" aria-label="Search results">
            {results.map((r, i) => (
              <li key={`${r.lat},${r.lng},${i}`}>
                <button className="map-result" onClick={() => pickResult(r)}>
                  📍 {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="row row-wrap" style={{ gap: '0.5rem' }}>
          <button
            className={`btn btn-sm ${adding ? 'btn-primary' : ''}`}
            onClick={() => setAdding((v) => !v)}
            aria-pressed={adding}
          >
            {adding ? 'Click the map…' : '➕ Add a place'}
          </button>
          <button
            className={`btn btn-sm ${sharing ? 'btn-primary' : ''}`}
            onClick={() => setSharing((v) => !v)}
            aria-pressed={sharing}
          >
            {sharing ? '📍 Sharing location' : '📍 Share my location'}
          </button>
        </div>

        {pending && (
          <form className="card stack" style={{ gap: '0.5rem' }} onSubmit={savePending}>
            <strong>Name this place</strong>
            <input
              className="input"
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="The Old Tavern, North gate…"
              aria-label="Place name"
            />
            <label className="field">
              Meet-up time <span className="muted small">(optional)</span>
              <input
                className="input"
                type="datetime-local"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            <div className="row" style={{ gap: '0.4rem' }}>
              <button className="btn btn-sm btn-primary" type="submit" disabled={!label.trim()}>
                Save pin
              </button>
              <button
                className="btn btn-sm btn-ghost"
                type="button"
                onClick={() => setPending(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="stack" style={{ gap: '0.4rem' }}>
          <h3 style={{ margin: 0 }}>Meet-up points</h3>
          {points.length === 0 ? (
            <p className="muted small" style={{ margin: 0 }}>
              No pins yet. Hit “Add a place”, then tap the map where you’ll meet.
            </p>
          ) : (
            points.map((p) => (
              <div key={p.id} className="card meet-item">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{p.label}</div>
                  {p.time && <div className="muted small">🕒 {fmtTime(p.time)}</div>}
                  {p.note && <div className="muted small">{p.note}</div>}
                </div>
                <div className="row" style={{ gap: '0.3rem' }}>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => centerOn(p)}
                    title="Center"
                  >
                    🎯
                  </button>
                  <a
                    className="btn btn-sm btn-ghost"
                    href={directionsUrl(p)}
                    target="_blank"
                    rel="noreferrer"
                    title="Directions"
                  >
                    ↗
                  </a>
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => void removeMeetPoint(p.id)}
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="map-canvas" ref={containerRef} aria-label="Room map" role="application" />
    </div>
  );
}
