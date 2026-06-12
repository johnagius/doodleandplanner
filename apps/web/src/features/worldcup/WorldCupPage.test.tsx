import { createRoom, emptyRoomState, type WorldCupState } from '@dap/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../components/Toast.js';
import {
  LocalStorageRepository,
  getRepository,
  setRepository,
  type Repository,
} from '../../lib/storage/index.js';
import { useWorldCupStore } from '../../state/worldCupStore.js';
import { WORLD_CUP_SLUG } from './worldCupRoom.js';
import { WorldCupPage } from './WorldCupPage.js';

/** A tiny, controlled board with one always-in-the-future, ready group match. */
async function seedControlledBoard(predictions: WorldCupState['predictions'] = []): Promise<void> {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString();
  const wc: WorldCupState = {
    season: '2026',
    title: 'Test Cup',
    version: 9999, // never auto-reseeded in this test
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
    predictions,
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
    // First run asks who you are, offering the four default names.
    const dialog = await screen.findByRole('dialog');
    for (const name of ['John', 'Daniel', 'Noel', 'Saviour']) {
      expect(within(dialog).getByRole('button', { name })).toBeInTheDocument();
    }
    await user.keyboard('{Escape}'); // dismiss to browse the rest

    await user.click(screen.getByRole('tab', { name: /Groups/ }));
    expect(await screen.findByText('Group A')).toBeInTheDocument();
    expect(screen.getByText('Group L')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /Bracket/ }));
    expect(await screen.findAllByText('Round of 32')).not.toHaveLength(0);

    await user.click(screen.getByRole('tab', { name: /Leaderboard/ }));
    expect(await screen.findByText(/No results yet/)).toBeInTheDocument();
  });

  it('falls back to a local board when the backend is unreachable', async () => {
    // A "remote" repo that fails like a CORS-blocked / offline fetch.
    const broken: Repository = {
      async createRoom() {
        throw new TypeError('NetworkError when attempting to fetch resource');
      },
      async getRoom() {
        throw new TypeError('NetworkError when attempting to fetch resource');
      },
      async saveRoom(s) {
        return s;
      },
      async deleteRoom() {},
      async listRooms() {
        return [];
      },
      subscribe() {
        return () => {};
      },
      async uploadPhoto() {},
      async getPhotoBlob() {
        return null;
      },
      async deletePhotoBytes() {},
    };
    setRepository(broken);

    renderPage();
    // The board still opens (seeded locally) instead of erroring out.
    expect(
      await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ }),
    ).toBeInTheDocument();
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'John' })).toBeInTheDocument();
    expect(useWorldCupStore.getState().offline).toBe(true);
  });

  it('adds a new name from the first-run prompt', async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await screen.findByRole('dialog');

    await user.click(within(dialog).getByRole('button', { name: '+ Add your name' }));
    await user.type(within(dialog).getByLabelText('Your name'), 'Mark');
    await user.click(within(dialog).getByRole('button', { name: 'Add' }));

    // Added, auto-selected, and the prompt closes.
    expect(await screen.findByRole('button', { name: 'Mark' })).toBeInTheDocument();
  });

  it('predicts a score, takes a result, and scores the leaderboard', async () => {
    const user = userEvent.setup();
    await seedControlledBoard();
    const { container } = renderPage();

    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });
    // Confirm who I am via the first-run prompt, then predict for the match.
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'John' }));
    await user.click(screen.getByRole('button', { name: 'Yes, this is me' }));
    await user.click(await screen.findByRole('button', { name: 'Aland goals: one more' }));

    await waitFor(() => {
      const chip = container.querySelector('.wc-pick-chip');
      expect(chip?.textContent).toContain('John');
      expect(chip?.textContent).toContain('1');
    });

    // Become the organiser (confirmed) and enter the real result: 1–0.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
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

  it("hides others' picks until kickoff, then reveals them", async () => {
    const user = userEvent.setup();
    await seedControlledBoard([
      {
        matchId: 'g-A-1',
        predictorId: 'p2',
        home: 2,
        away: 1,
        updatedAt: new Date().toISOString(),
      },
    ]);
    const { container } = renderPage();

    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'John' }));
    await user.click(screen.getByRole('button', { name: 'Yes, this is me' }));

    // Before kickoff: Daniel's pick is hidden behind a summary.
    await waitFor(() => {
      const picks = container.querySelector('.wc-picks');
      expect(picks?.textContent).toMatch(/hidden until kickoff/i);
      expect(picks?.textContent).not.toContain('Daniel');
    });

    // Entering the result locks the match → everyone's picks reveal.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: /Organiser/ }));
    await user.click(await screen.findByRole('button', { name: 'Home result goals: one more' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(container.querySelector('.wc-picks')?.textContent).toContain('Daniel');
    });
  });

  it('shows the crowd pulse count without revealing picks before kickoff', async () => {
    const user = userEvent.setup();
    await seedControlledBoard([
      {
        matchId: 'g-A-1',
        predictorId: 'p2',
        home: 2,
        away: 1,
        updatedAt: new Date().toISOString(),
      },
    ]);
    const { container } = renderPage();

    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'John' }));
    await user.click(screen.getByRole('button', { name: 'Yes, this is me' }));

    // The pulse reports participation (1 of 2) but never Daniel's scoreline.
    expect(await screen.findByText(/1 of 2 predicted/)).toBeInTheDocument();
    const picks = container.querySelector('.wc-picks')?.textContent ?? '';
    expect(picks).not.toContain('2–1');
    expect(picks).not.toContain('Daniel');
  });

  it('crowns the closest pick once the result is in', async () => {
    const user = userEvent.setup();
    await seedControlledBoard();
    renderPage();

    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'John' }));
    await user.click(screen.getByRole('button', { name: 'Yes, this is me' }));
    await user.click(await screen.findByRole('button', { name: 'Aland goals: one more' }));

    // Enter the matching result; John's exact pick earns the 🎯 crown.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: /Organiser/ }));
    await user.click(await screen.findByRole('button', { name: 'Home result goals: one more' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('FT')).toBeInTheDocument();
    expect(await screen.findByTitle('Closest pick')).toBeInTheDocument();
  });

  it('posts a comment in the match card thread', async () => {
    const user = userEvent.setup();
    await seedControlledBoard();
    renderPage();
    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'John' }));
    await user.click(screen.getByRole('button', { name: 'Yes, this is me' }));

    // The thread is collapsed by default — open it, then post.
    await user.click(await screen.findByRole('button', { name: /Comment/ }));
    await user.type(screen.getByLabelText('Match comment'), 'Come on England!');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('Come on England!')).toBeInTheDocument();
  });
});
