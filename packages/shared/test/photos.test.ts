import { describe, expect, it } from 'vitest';
import { createPhoto, eventsForCountry, groupPhotosByAlbum, updatePhoto } from '../src/photos.js';
import type { Photo } from '../src/types.js';

const now = () => new Date('2026-05-30T12:00:00Z');
const base = { roomId: 'r1', authorId: 'alice', mime: 'image/jpeg', width: 800, height: 600, now };

describe('photos', () => {
  it('creates metadata, trimming caption and optional fields', () => {
    const p = createPhoto({
      ...base,
      caption: '  Sunset  ',
      country: 'Malta',
      event: ' Beach day ',
    });
    expect(p.caption).toBe('Sunset');
    expect(p.country).toBe('Malta');
    expect(p.event).toBe('Beach day');
    expect(p.id).toMatch(/^photo/);
  });

  it('uses a provided id so bytes and metadata share it', () => {
    const p = createPhoto({ ...base, id: 'photo_fixed' });
    expect(p.id).toBe('photo_fixed');
  });

  it('updates event/caption immutably', () => {
    const p = createPhoto({ ...base, event: 'Old town' });
    const u = updatePhoto(p, { event: 'Beach day', caption: 'hi' });
    expect(u).not.toBe(p);
    expect(p.event).toBe('Old town');
    expect(u.event).toBe('Beach day');
    expect(u.caption).toBe('hi');
  });

  it('groups into albums by country then event, no-location last', () => {
    const photos: Photo[] = [
      createPhoto({ ...base, country: 'Malta', event: 'Beach day' }),
      createPhoto({ ...base, country: 'Malta', event: 'Old town' }),
      createPhoto({ ...base, country: 'Malta' }), // untagged within Malta
      createPhoto({ ...base, country: 'Italy', event: 'Rome' }),
      createPhoto({ ...base }), // no location
    ];
    const albums = groupPhotosByAlbum(photos);
    expect(albums.map((a) => a.country)).toEqual(['Italy', 'Malta', null]);

    const malta = albums.find((a) => a.country === 'Malta')!;
    expect(malta.count).toBe(3);
    // Tagged events alphabetical first, untagged (null) last.
    expect(malta.events.map((e) => e.event)).toEqual(['Beach day', 'Old town', null]);
  });

  it('lists distinct event tags used within a country', () => {
    const photos: Photo[] = [
      createPhoto({ ...base, country: 'Malta', event: 'Beach day' }),
      createPhoto({ ...base, country: 'Malta', event: 'Beach day' }),
      createPhoto({ ...base, country: 'Malta', event: 'Old town' }),
      createPhoto({ ...base, country: 'Italy', event: 'Rome' }),
    ];
    expect(eventsForCountry(photos, 'Malta')).toEqual(['Beach day', 'Old town']);
  });
});
