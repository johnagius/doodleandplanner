import { createRoom, emptyRoomState, type WorldCupState } from '@dap/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../components/Toast.js';
import { LocalStorageRepository, getRepository, setRepository } from '../../lib/storage/index.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { WORLD_CUP_SLUG } from './worldCupRoom.js';
import { WorldCupPage } from './WorldCupPage.js';

/** A tiny, controlled board with one always-in-the-future, ready group match. */
async function seedControlledBoard(): Promise<void> {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
  const wc: WorldCupState = {
    season: '2026',
    title: 'Test Cup',
    teams: [
      { id: 'AAA', name: 'Aland', flag: '🅰️', group: 'A' },
      { id: 'BBB', name: 'Bland', flag: '🅱️', group: 'A' },
    ],
    matches: [
      {
        id: 'g-A-1',
        stage: 'group',
        group: 'A',
        matchday: 1,
        order: 0,
        kickoff: future,
        homeId: 'AAA',
        awayId: 'BBB',
      },
    ],
    predictors: [
      { id: 'p1', name: 'John' },
      { id: 'p2', name: 'Daniel' },
    ],
    predictions: [],
    createdAt: new Date().toISOString(),
  };
  const { room } = await createRoom({
    name: 'World Cup',
    ownerName: 'Predictions',
    slug: WORLD_CUP_SLUG,
  });
  await getRepository().createRoom({ ...emptyRoomState(room), worldCup: wc });
}

function renderPage() {
  return render(
    <ToastProvider>
      <MemoryRouter>
        <WorldCupPage />
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  setRepository(new LocalStorageRepository());
  useWorldCupStore.setState({
    state: null,
    loading: false,
    error: null,
    meId: null,
    admin: false,
    unsubscribe: null,
  });
});

afterEach(() => {
  useWorldCupStore.getState().leave();
});

describe('WorldCupPage', () => {
  it('seeds the full board and switches between sections', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ }),
    ).toBeInTheDocument();
    // Four default predictors, no login.
    for (const name of ['John', 'Daniel', 'Noel', 'Saviour']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }

    await user.click(screen.getByRole('tab', { name: /Groups/ }));
    expect(await screen.findByText('Group A')).toBeInTheDocument();
    expect(screen.getByText('Group L')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Bracket/ }));
    expect(await screen.findAllByText('Round of 32')).not.toHaveLength(0);

    await user.click(screen.getByRole('tab', { name: /Leaderboard/ }));
    expect(await screen.findByText(/No results yet/)).toBeInTheDocument();
  });

  it('adds a new predictor name', async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });

    await user.click(screen.getByRole('button', { name: '+ Add name' }));
    await user.type(screen.getByLabelText('New predictor name'), 'Mark');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(await screen.findByRole('button', { name: 'Mark' })).toBeInTheDocument();
  });

  it('predicts a score, takes a result, and scores the leaderboard', async () => {
    const user = userEvent.setup();
    await seedControlledBoard();
    const { container } = renderPage();

    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });
    // Pick who I am, then predict 1–0 for the (future, unlocked) match.
    await user.click(screen.getByRole('button', { name: 'John' }));
    await user.click(await screen.findByRole('button', { name: 'Aland goals: one more' }));

    await waitFor(() => {
      const chip = container.querySelector('.wc-pick-chip');
      expect(chip?.textContent).toContain('John');
      expect(chip?.textContent).toContain('1');
    });

    // Become the organiser and enter the real result: 1–0 (an exact hit).
    await user.click(screen.getByRole('button', { name: /Organiser/ }));
    await user.click(await screen.findByRole('button', { name: 'Home result goals: one more' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // The match shows full-time, and John banks the 5 points on the leaderboard.
    expect(await screen.findByText('FT')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Leaderboard/ }));
    const leader = container.querySelector('.wc-leader-row')!;
    expect(within(leader as HTMLElement).getByText('John')).toBeInTheDocument();
    expect(leader.querySelector('.wc-leader-pts')?.textContent).toBe('5');
  });
});
