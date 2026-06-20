import type { WcMatch, WcMatchEvent, WorldCupState } from '@dap/shared';
import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { HighlightOverlay } from './HighlightOverlay.js';

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
  teams: [
    { id: 'AAA', name: 'Aland', flag: '🅰️', group: 'A' },
    { id: 'BBB', name: 'Bland', flag: '🅱️', group: 'A' },
  ],
  predictors: [],
  predictions: [],
} as unknown as WorldCupState;

function setEvents(events?: WcMatchEvent[]) {
  useWorldCupStore.setState({ matchEvents: events ? { m1: events } : {} });
}

beforeEach(() => {
  useWorldCupStore.setState({
    live: { m1: { status: 'IN_PLAY', minute: 10, home: 0, away: 0 } },
    matchEvents: {},
  });
});
afterEach(() => useWorldCupStore.setState({ matchEvents: {}, live: {} }));

describe('HighlightOverlay', () => {
  it('baselines existing bookings, then pops a card for a new one', () => {
    setEvents([{ minute: "12'", kind: 'yellow', teamTla: 'AAA', player: 'Defender' }]);
    const { container } = render(<HighlightOverlay wc={wc} match={match} />);
    // The pre-existing booking baselines silently — no card on open.
    expect(container.querySelector('.wc-highlight')).toBeNull();

    act(() =>
      setEvents([
        { minute: "12'", kind: 'yellow', teamTla: 'AAA', player: 'Defender' },
        { minute: "66'", kind: 'red', teamTla: 'BBB', player: 'Keeper' },
      ]),
    );

    const card = container.querySelector('.wc-highlight');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('Red card');
    expect(card?.textContent).toContain('Keeper');
    expect(card?.textContent).toContain('Bland');
  });

  it('treats a second yellow as a sending-off', () => {
    setEvents([{ minute: "20'", kind: 'yellow', teamTla: 'AAA', player: 'Hardman' }]);
    const { container } = render(<HighlightOverlay wc={wc} match={match} />);
    act(() =>
      setEvents([
        { minute: "20'", kind: 'yellow', teamTla: 'AAA', player: 'Hardman' },
        { minute: "55'", kind: 'yellow', teamTla: 'AAA', player: 'Hardman' },
      ]),
    );
    const card = container.querySelector('.wc-highlight');
    expect(card?.textContent).toContain('Second yellow!');
    expect(card?.textContent).toContain('down to ten');
    expect(container.querySelector('.wc-highlight.is-red')).not.toBeNull();
  });

  it('counts a team down to nine on a second dismissal', () => {
    setEvents([]);
    const { container } = render(<HighlightOverlay wc={wc} match={match} />);
    act(() => setEvents([{ minute: "30'", kind: 'red', teamTla: 'BBB', player: 'Keeper' }]));
    expect(container.querySelector('.wc-highlight')?.textContent).toContain('down to ten');
    act(() =>
      setEvents([
        { minute: "30'", kind: 'red', teamTla: 'BBB', player: 'Keeper' },
        { minute: "70'", kind: 'red', teamTla: 'BBB', player: 'Sweeper' },
      ]),
    );
    expect(container.querySelector('.wc-highlight')?.textContent).toContain('down to nine');
  });

  it('leaves goals to the goal overlay', () => {
    setEvents([]);
    const { container } = render(<HighlightOverlay wc={wc} match={match} />);
    act(() => setEvents([{ minute: "30'", kind: 'goal', teamTla: 'AAA', player: 'Striker' }]));
    expect(container.querySelector('.wc-highlight')).toBeNull();
  });
});
