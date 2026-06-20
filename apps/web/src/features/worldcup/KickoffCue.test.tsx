import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorldCupStore, type WcLiveInfo } from '../../state/worldCupStore.js';
import { KickoffCue } from './KickoffCue.js';
import { playSound } from './wcSound.js';

vi.mock('./wcSound.js', () => ({ playSound: vi.fn(), vibrate: vi.fn() }));

const live = (status: string): WcLiveInfo => ({ status, minute: null, home: null, away: null });

async function renderCue() {
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(<KickoffCue matchId="m1" />);
  });
  return utils;
}

beforeEach(() => {
  useWorldCupStore.setState({ live: {} });
  vi.clearAllMocks();
});

describe('KickoffCue', () => {
  it('whistles and flashes when a match kicks off while watching', async () => {
    useWorldCupStore.setState({ live: { m1: live('TIMED') } });
    const { container } = await renderCue();
    expect(container.querySelector('.wc-kickoff')).toBeNull();
    await act(async () => {
      useWorldCupStore.setState({ live: { m1: live('IN_PLAY') } });
    });
    expect(playSound).toHaveBeenCalledWith('whistle');
    expect(container.querySelector('.wc-kickoff')?.textContent).toContain('Kick-off');
  });

  it('does not fire on the second-half restart (PAUSED → IN_PLAY)', async () => {
    useWorldCupStore.setState({ live: { m1: live('PAUSED') } });
    await renderCue();
    await act(async () => {
      useWorldCupStore.setState({ live: { m1: live('IN_PLAY') } });
    });
    expect(playSound).not.toHaveBeenCalled();
  });

  it('does not fire when opening on a game already in play', async () => {
    useWorldCupStore.setState({ live: { m1: live('IN_PLAY') } });
    await renderCue();
    expect(playSound).not.toHaveBeenCalled();
  });
});
