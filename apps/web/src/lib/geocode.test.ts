import { afterEach, describe, expect, it, vi } from 'vitest';
import { forwardGeocode, reverseGeocode } from './geocode.js';

afterEach(() => vi.restoreAllMocks());

describe('forwardGeocode', () => {
  it('maps Nominatim results to {label,lat,lng}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          { display_name: 'Colosseum, Rome, Italy', lat: '41.89', lon: '12.49' },
          { display_name: 'No coords' }, // dropped (missing lat/lon)
        ],
      }),
    );
    const results = await forwardGeocode('Colosseum');
    expect(results).toEqual([{ label: 'Colosseum, Rome, Italy', lat: 41.89, lng: 12.49 }]);
  });

  it('returns [] on empty query or network error', async () => {
    expect(await forwardGeocode('   ')).toEqual([]);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await forwardGeocode('x')).toEqual([]);
  });
});

describe('reverseGeocode', () => {
  it('extracts country and a locality label', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ address: { country: 'Malta', town: 'Sliema' } }),
      }),
    );
    expect(await reverseGeocode(35.9, 14.5)).toEqual({ country: 'Malta', place: 'Sliema' });
  });

  it('fails soft to {} on error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await reverseGeocode(0, 0)).toEqual({});
  });
});
