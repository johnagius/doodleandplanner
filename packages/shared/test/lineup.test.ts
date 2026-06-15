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
    expect(pitchRow('LF')).toBe('FWD'); // left forward — was mis-filed as MID
    expect(pitchRow('RF')).toBe('FWD');
    expect(pitchRow('SS')).toBe('FWD');
    expect(pitchRow('CB')).toBe('DEF');
    expect(pitchRow('CF-L')).toBe('FWD'); // side-suffixed striker — was leaking to MID
    expect(pitchRow('CF-R')).toBe('FWD');
    expect(pitchRow('CM-L')).toBe('MID');
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

  it('reads a 4-4-2 with side-suffixed centre-forwards (the Côte d’Ivoire case)', () => {
    const civ = ['G', 'CD-L', 'CD-R', 'LB', 'RB', 'CM-L', 'CM-R', 'LM', 'RM', 'CF-L', 'CF-R'].map(
      (pos, i) => P('p' + i, pos, i + 1),
    );
    expect(formationOf(civ)).toBe('4-4-2'); // was "4-6" before the suffix fix
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

    // The back four read LB → CD-L → CD-R → RB, full-backs on the touchline.
    const def = placed.filter((p) => p.row === 'DEF').sort((a, b) => a.x - b.x);
    expect(def.map((p) => p.player.name)).toEqual([
      'Left Back',
      'Centre Back L',
      'Centre Back R',
      'Right Back',
    ]);
    expect(def[0]!.x).toBeLessThan(0.2); // LB hugs the line
    expect(def[3]!.x).toBeGreaterThan(0.8); // RB hugs the line
    expect(def[1]!.x).toBeGreaterThan(0.2); // CB stays inner
    expect(def[2]!.x).toBeLessThan(0.8);
  });

  it('keeps twin holding mids central, not flung to the wings', () => {
    const placed = placeLineup({
      teamTla: 'X',
      players: [
        P('G', 'G', 1),
        P('lb', 'LB', 2),
        P('cbl', 'CD-L', 3),
        P('cbr', 'CD-R', 4),
        P('rb', 'RB', 5),
        P('dm1', 'DM', 6),
        P('dm2', 'DM', 7),
        P('aml', 'AM-L', 8),
        P('am', 'AM', 9),
        P('amr', 'AM-R', 10),
        P('st', 'ST', 11),
      ],
    });
    const dms = placed.filter((p) => p.row === 'DM');
    expect(dms).toHaveLength(2);
    for (const d of dms) {
      expect(d.x).toBeGreaterThan(0.3);
      expect(d.x).toBeLessThan(0.7);
    }
    expect(dms[0]!.x).not.toBeCloseTo(dms[1]!.x);
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
    // Even the top of the scale stays in sane territory (no €150M no-names).
    for (const n of ['Wahi', 'Sébastien Haller', 'A. Player', 'Zzz Xyz', 'Foo Bar', 'Q']) {
      expect(estimatedValueM(n)).toBeLessThanOrEqual(110);
    }
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
