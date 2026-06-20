import type { WcMatch, WorldCupState } from '@dap/shared';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorldCupStore, type WcLiveInfo } from '../../state/worldCupStore.js';
import { GoalOverlay } from './GoalOverlay.js';

vi.mock('./wcSound.js', () => ({ playSound: vi.fn(), vibrate: vi.fn() }));
import { playSound, vibrate } from './wcSound.js';

const match = {
  id: 'm1',
  stage: 'group',
  group: 'A',
  matchday: 1,
  order: 0,
  kickoff: new Date().toISOString(),
  homeId: 'AAA',
  awayId: 'BBB',
} as WcMatch;

const wc = {
  predictors: [{ id: 'p1', name: 'John' }],
  predictions: [{ matchId: 'm1', predictorId: 'p1', home: 1, away: 0 }],
} as unknown as WorldCupState;

function setLive(live?: WcLiveInfo) {
  useWorldCupStore.setState({ live: live ? { m1: live } : {} });
}

beforeEach(() => {
  vi.clearAllMocks();
  setLive({ status: 'IN_PLAY', minute: 10, home: 0, away: 0 });
});
afterEach(() => setLive());

describe('GoalOverlay', () => {
  it('is silent on mount (baseline) then flashes + cues on a goal', () => {
    const { container } = render(<GoalOverlay wc={wc} match={match} meId="p1" />);
    // First sighting baselines — no flash, no sound.
    expect(container.querySelector('.wc-goal-flash')).toBeNull();
    expect(playSound).not.toHaveBeenCalled();

    act(() => setLive({ status: 'IN_PLAY', minute: 20, home: 1, away: 0 }));

    const flash = container.querySelector('.wc-goal-flash');
    expect(flash).not.toBeNull();
    expect(flash?.textContent).toContain('GOAL');
    const score = container.querySelector('.wc-goal-score')?.textContent ?? '';
    expect(score).toContain('1');
    expect(score).toContain('0');
    // Cues are wired (the opt-in no-op lives inside wcSound, tested there).
    expect(playSound).toHaveBeenCalledWith('goal');
    expect(vibrate).toHaveBeenCalled();
  });

  it('shows my provisional points swing — a 1-0 pick going exact', () => {
    const { container } = render(<GoalOverlay wc={wc} match={match} meId="p1" />);
    act(() => setLive({ status: 'IN_PLAY', minute: 20, home: 1, away: 0 }));
    // My 1-0 pick is now spot-on, so the pop shows a positive swing.
    const pts = container.querySelector('.wc-goal-pts');
    expect(pts).not.toBeNull();
    expect(pts?.textContent).toMatch(/\+\d+ pts/);
  });
});
