import { describe, expect, it } from 'vitest';
import {
  estimatedValueM,
  formationOf,
  lineupRating,
  pitchRow,
  placeLineup,
  teamValueM,
  type WcLineup,
  type WcLineupPlayer,
} from '../src/lineup.js';

const P = (name: string, pos: string, formationPlace: number): WcLineupPlayer => ({
  name,
  jersey: formationPlace,
  pos,
  starter: true,
  formationPlace,
});

/** A 4-3-3 starting XI. */
function lineup433(): WcLineup {
  return {
    teamTla: 'ESP',
    players: [
      P('Keeper', 'G', 1),
      P('Left Back', 'LB', 2),
      P('Centre Back L', 'CD-L', 3),
      P('Centre Back R', 'CD-R', 4),
      P('Right Back', 'RB', 5),
      P('Mid L', 'CM-L', 6),
      P('Mid C', 'CM', 7),
      P('Mid R', 'CM-R', 8),
      P('Left Wing', 'LW', 9),
      P('Striker', 'ST', 10),
      P('Right Wing', 'RW', 11),
      { ...P('Sub', 'ST', 12), starter: false }, // bench — excluded
    ],
  };
}

describe('pitchRow', () => {
  it('classifies positions into pitch bands', () => {
    expect(pitchRow('G')).toBe('GK');
    expect(pitchRow('CD-L')).toBe('DEF');
    expect(pitchRow('LWB')).toBe('DEF');
    expect(pitchRow('DM')).toBe('DM');
    expect(pitchRow('CM-R')).toBe('MID');
    expect(pitchRow('CAM')).toBe('AM');
    expect(pitchRow('LW')).toBe('FWD');
    expect(pitchRow('ST')).toBe('FWD');
  });
});

describe('formationOf', () => {
  it('reads a 4-3-3 and a 4-2-3-1', () => {
    expect(formationOf(lineup433().players)).toBe('4-3-3');
    const f4231: WcLineupPlayer[] = [
      P('G', 'G', 1),
      P('a', 'LB', 2),
      P('b', 'CD-L', 3),
      P('c', 'CD-R', 4),
      P('d', 'RB', 5),
      P('e', 'DM', 6),
      P('f', 'DM', 7),
      P('g', 'AM-L', 8),
      P('h', 'AM', 9),
      P('i', 'AM-R', 10),
      P('j', 'ST', 11),
    ];
    expect(formationOf(f4231)).toBe('4-2-3-1');
  });
});

describe('placeLineup', () => {
  it('places only the XI with sane coordinates, keeper at the back, centred', () => {
    const placed = placeLineup(lineup433());
    expect(placed).toHaveLength(11); // sub excluded
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
    const gk = placed.find((p) => p.row === 'GK')!;
    expect(gk.x).toBeCloseTo(0.5); // keeper centred
    const fwd = placed.filter((p) => p.row === 'FWD');
    expect(fwd).toHaveLength(3);
    expect(gk.y).toBeGreaterThan(fwd[0]!.y); // keeper nearer than forwards
    // Left wing sits left of the right wing.
    const lw = placed.find((p) => p.player.name === 'Left Wing')!;
    const rw = placed.find((p) => p.player.name === 'Right Wing')!;
    expect(lw.x).toBeLessThan(rw.x);
  });
});

describe('rating + value', () => {
  it('are deterministic and in sensible ranges', () => {
    expect(lineupRating('Lamine Yamal')).toBe(lineupRating('Lamine Yamal'));
    const r = lineupRating('Lamine Yamal');
    expect(r).toBeGreaterThanOrEqual(62);
    expect(r).toBeLessThanOrEqual(91);
    const v = estimatedValueM('Lamine Yamal');
    expect(v).toBe(estimatedValueM('Lamine Yamal'));
    expect(v).toBeGreaterThan(0);
  });

  it('sums the starting XI into a team value', () => {
    const l = lineup433();
    const total = teamValueM(l);
    const manual = l.players
      .filter((p) => p.starter)
      .reduce((s, p) => s + estimatedValueM(p.name), 0);
    expect(total).toBeCloseTo(Math.round(manual * 10) / 10);
  });
});
