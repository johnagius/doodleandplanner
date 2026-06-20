import type { WcMatch, WorldCupState } from '@dap/shared';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { IntervalReport } from './IntervalReport.js';
import { playSound } from './wcSound.js';

vi.mock('./wcSound.js', () => ({ playSound: vi.fn(), vibrate: vi.fn() }));

const wc = {
  teams: [
    { id: 'ENG', name: 'England', flag: '🏴', group: 'A' },
    { id: 'ESP', name: 'Spain', flag: '🇪🇸', group: 'A' },
  ],
} as unknown as WorldCupState;

const match = {
  id: 'm1',
  stage: 'group',
  group: 'A',
  matchday: 1,
  order: 0,
  kickoff: '2026-06-20T18:00:00Z',
  homeId: 'ENG',
  awayId: 'ESP',
} as WcMatch;

async function renderReport(m: WcMatch = match) {
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(<IntervalReport wc={wc} match={m} />);
  });
  return utils;
}

beforeEach(() => {
  useWorldCupStore.setState({ live: {}, matchEvents: {} });
  vi.clearAllMocks();
});

describe('IntervalReport', () => {
  it('shows nothing while the match is mid-half', async () => {
    useWorldCupStore.setState({
      live: { m1: { status: 'IN_PLAY', minute: 30, home: 0, away: 0 } },
    });
    const { container } = await renderReport();
    expect(container.querySelector('.wc-interval')).toBeNull();
  });

  it('takes over the screen at half time with the score and scorers', async () => {
    useWorldCupStore.setState({
      live: {
        m1: { status: 'PAUSED', minute: 45, home: 1, away: 0, homeColor: '#d11a2a' },
      },
      matchEvents: { m1: [{ minute: "23'", kind: 'goal', teamTla: 'ENG', player: 'Kane' }] },
    });
    const { container } = await renderReport();
    expect(container.querySelector('.wc-interval')).not.toBeNull();
    expect(screen.getByText(/Half Time/)).toBeInTheDocument();
    expect(container.textContent).toContain('Kane');
    expect(container.textContent).toContain('England');
    // The home score is tinted with the team's brand colour.
    const homeNum = container.querySelector('.wc-interval-nums b');
    expect((homeNum as HTMLElement | null)?.style.color).toBeTruthy();
  });

  it('can be dismissed to watch the room', async () => {
    useWorldCupStore.setState({
      live: { m1: { status: 'PAUSED', minute: 45, home: 0, away: 0 } },
    });
    const { container } = await renderReport();
    expect(container.querySelector('.wc-interval')).not.toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Dismiss the report'));
    });
    expect(container.querySelector('.wc-interval')).toBeNull();
  });

  it('reads Full Time from a finished match, with verdict and star', async () => {
    useWorldCupStore.setState({
      live: { m1: { status: 'FINISHED', minute: null, home: 2, away: 1 } },
      matchEvents: {
        m1: [
          { minute: "12'", kind: 'goal', teamTla: 'ENG', player: 'Kane' },
          { minute: "40'", kind: 'goal', teamTla: 'ENG', player: 'Kane' },
        ],
      },
    });
    const { container } = await renderReport();
    expect(screen.getByText(/Full Time/)).toBeInTheDocument();
    expect(container.querySelector('.wc-interval')?.className).toContain('is-ft');
    // A verdict names the winner and the winning side is emphasised.
    expect(container.textContent).toContain('England win');
    expect(container.querySelector('.wc-interval-team.is-win')?.textContent).toContain('England');
    expect(container.querySelector('.wc-interval-team.is-lose')?.textContent).toContain('Spain');
    // The standout performer is celebrated (leading scorer, no ratings here).
    expect(container.querySelector('.wc-interval-star')?.textContent).toContain(
      'Star of the match',
    );
    expect(container.querySelector('.wc-interval-star')?.textContent).toContain('Kane');
  });

  it('blows a single whistle when a half ends while watching — never on open', async () => {
    useWorldCupStore.setState({
      live: { m1: { status: 'IN_PLAY', minute: 45, home: 0, away: 0 } },
    });
    await renderReport();
    expect(playSound).not.toHaveBeenCalled();
    await act(async () => {
      useWorldCupStore.setState({
        live: { m1: { status: 'PAUSED', minute: 45, home: 0, away: 0 } },
      });
    });
    expect(playSound).toHaveBeenCalledWith('whistle');
  });

  it('gives full time the three-blast cue', async () => {
    useWorldCupStore.setState({
      live: { m1: { status: 'IN_PLAY', minute: 90, home: 2, away: 1 } },
    });
    await renderReport();
    await act(async () => {
      useWorldCupStore.setState({
        live: { m1: { status: 'FINISHED', minute: null, home: 2, away: 1 } },
      });
    });
    expect(playSound).toHaveBeenCalledWith('fulltime');
  });

  it('does not whistle merely for opening at a break', async () => {
    useWorldCupStore.setState({ live: { m1: { status: 'PAUSED', minute: 45, home: 0, away: 0 } } });
    await renderReport();
    expect(playSound).not.toHaveBeenCalled();
  });
});
