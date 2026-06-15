import { createRoom, emptyRoomState, type WorldCupState } from '@dap/shared';
import { act, render, screen, waitFor, within } from '@testing-library/react';
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

  it('repeats the day flip at the foot of the fixtures list', async () => {
    const user = userEvent.setup();
    // A two-day board so the flip genuinely moves between days.
    const d1 = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const d2 = new Date(Date.now() + 12 * 86_400_000).toISOString();
    const wc: WorldCupState = {
      season: '2026',
      title: 'Test Cup',
      version: 9999,
      teams: [
        { id: 'AAA', name: 'Aland', flag: '🅰️', group: 'A' },
        { id: 'BBB', name: 'Bland', flag: '🅱️', group: 'A' },
      ],
      matches: [
        { id: 'g-A-1', stage: 'group', group: 'A', matchday: 1, order: 0, kickoff: d1, homeId: 'AAA', awayId: 'BBB' }, // prettier-ignore
        { id: 'g-A-2', stage: 'group', group: 'A', matchday: 2, order: 1, kickoff: d2, homeId: 'BBB', awayId: 'AAA' }, // prettier-ignore
      ],
      predictors: [{ id: 'p1', name: 'John' }],
      predictions: [],
      createdAt: new Date().toISOString(),
    };
    const { room } = await createRoom({
      name: 'World Cup',
      ownerName: 'Predictions',
      slug: WORLD_CUP_SLUG,
    });
    await getRepository().createRoom({ ...emptyRoomState(room), worldCup: wc });

    renderPage();
    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });
    await user.keyboard('{Escape}'); // dismiss first-run prompt; Fixtures is the default tab

    // The flip renders twice now — top and foot of the list — both on day 1.
    const nextButtons = await screen.findAllByRole('button', { name: 'Next day' });
    expect(nextButtons).toHaveLength(2);
    expect(screen.getAllByText(/Day 1 of 2/)).toHaveLength(2);

    // Flipping from the foot control advances the day exactly like the top one.
    await user.click(nextButtons[1]!);
    await waitFor(() => expect(screen.getAllByText(/Day 2 of 2/)).toHaveLength(2));
  });

  it('charts the day-by-day timeline with the day winner', async () => {
    const user = userEvent.setup();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const at = new Date().toISOString();
    const wc: WorldCupState = {
      season: '2026',
      title: 'Test Cup',
      version: 9999,
      teams: [
        { id: 'AAA', name: 'Aland', flag: '🅰️', group: 'A' },
        { id: 'BBB', name: 'Bland', flag: '🅱️', group: 'A' },
      ],
      matches: [
        { id: 'g-A-1', stage: 'group', group: 'A', matchday: 1, order: 0, kickoff: past, homeId: 'AAA', awayId: 'BBB', result: { home: 2, away: 0 } }, // prettier-ignore
      ],
      predictors: [
        { id: 'p1', name: 'John' },
        { id: 'p2', name: 'Daniel' },
      ],
      predictions: [
        { matchId: 'g-A-1', predictorId: 'p1', home: 2, away: 0, updatedAt: at }, // exact, +5
        { matchId: 'g-A-1', predictorId: 'p2', home: 0, away: 1, updatedAt: at }, // miss, 0
      ],
      createdAt: at,
    };
    const { room } = await createRoom({
      name: 'World Cup',
      ownerName: 'Predictions',
      slug: WORLD_CUP_SLUG,
    });
    await getRepository().createRoom({ ...emptyRoomState(room), worldCup: wc });

    const { container } = renderPage();
    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });
    await user.keyboard('{Escape}'); // dismiss first-run prompt

    await user.click(screen.getByRole('tab', { name: /Timeline/ }));

    expect(await screen.findByRole('heading', { name: /Standings over time/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Days won/ })).toBeInTheDocument();
    expect(screen.getByText('Day winner')).toBeInTheDocument();
    // John topped the day with an exact 2-0 (+5); the feed names him as the winner.
    expect(container.querySelector('.wc-tl-winner-name')?.textContent).toBe('John');
    expect(container.querySelector('.wc-tl-winner-pts')?.textContent).toBe('+5');
  });

  it('breaks down a player performance and switches between players', async () => {
    const user = userEvent.setup();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const at = new Date().toISOString();
    const wc: WorldCupState = {
      season: '2026',
      title: 'Test Cup',
      version: 9999,
      teams: [
        { id: 'AAA', name: 'Aland', flag: '🅰️', group: 'A' },
        { id: 'BBB', name: 'Bland', flag: '🅱️', group: 'A' },
      ],
      matches: [
        { id: 'g-A-1', stage: 'group', group: 'A', matchday: 1, order: 0, kickoff: past, homeId: 'AAA', awayId: 'BBB', result: { home: 2, away: 0 } }, // prettier-ignore
      ],
      predictors: [
        { id: 'p1', name: 'John' },
        { id: 'p2', name: 'Daniel' },
      ],
      predictions: [
        { matchId: 'g-A-1', predictorId: 'p1', home: 2, away: 0, updatedAt: at }, // exact, +5
        { matchId: 'g-A-1', predictorId: 'p2', home: 0, away: 1, updatedAt: at }, // miss, +0
      ],
      createdAt: at,
    };
    const { room } = await createRoom({
      name: 'World Cup',
      ownerName: 'Predictions',
      slug: WORLD_CUP_SLUG,
    });
    await getRepository().createRoom({ ...emptyRoomState(room), worldCup: wc });

    const { container } = renderPage();
    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });
    await user.keyboard('{Escape}'); // dismiss first-run prompt

    await user.click(screen.getByRole('tab', { name: /Performance/ }));

    // Defaults to the first predictor (John) — his exact 2-0 scored +5.
    expect(await screen.findByRole('heading', { name: /Every guess/ })).toBeInTheDocument();
    expect(container.querySelector('.wc-perf-pts')?.textContent).toBe('+5');

    // Switch to Daniel via the picker — his 0-1 missed for +0.
    await user.click(screen.getByRole('tab', { name: /Daniel/ }));
    await waitFor(() => expect(container.querySelector('.wc-perf-pts')?.textContent).toBe('+0'));
  });

  it('settles the fake-money bets on the Bets tab', async () => {
    const user = userEvent.setup();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const at = new Date().toISOString();
    const wc: WorldCupState = {
      season: '2026',
      title: 'Test Cup',
      version: 9999,
      teams: [
        { id: 'AAA', name: 'Aland', flag: '🅰️', group: 'A' },
        { id: 'BBB', name: 'Bland', flag: '🅱️', group: 'A' },
      ],
      matches: [
        { id: 'g-A-1', stage: 'group', group: 'A', matchday: 1, order: 0, kickoff: past, homeId: 'AAA', awayId: 'BBB', result: { home: 2, away: 0 } }, // prettier-ignore
      ],
      predictors: [
        { id: 'p1', name: 'John' },
        { id: 'p2', name: 'Daniel' },
      ],
      predictions: [
        { matchId: 'g-A-1', predictorId: 'p1', home: 2, away: 0, updatedAt: at }, // backs home → wins
        { matchId: 'g-A-1', predictorId: 'p2', home: 0, away: 1, updatedAt: at }, // backs away → loses
      ],
      odds: { 'g-A-1': { homeML: 100, drawML: 200, awayML: 400 } }, // home @ evens
      createdAt: at,
    };
    const { room } = await createRoom({
      name: 'World Cup',
      ownerName: 'Predictions',
      slug: WORLD_CUP_SLUG,
    });
    await getRepository().createRoom({ ...emptyRoomState(room), worldCup: wc });

    renderPage();
    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('tab', { name: /Bets/ }));
    expect(await screen.findByRole('heading', { name: /Bankroll/ })).toBeInTheDocument();
    // John backed the home win at evens (€5) → +€5.00; Daniel lost his €5.
    expect(screen.getByText('+€5.00')).toBeInTheDocument();
    expect(screen.getByText('−€5.00')).toBeInTheDocument();
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

  it("reacts to a mate's pick only after it's revealed", async () => {
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

    // Before kickoff Daniel's pick is hidden — nothing to react to.
    expect(screen.queryByRole('button', { name: /React to/ })).toBeNull();

    // Organiser enters a result → the match locks and picks reveal.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: /Organiser/ }));
    await user.click(await screen.findByRole('button', { name: 'Home result goals: one more' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('FT');

    // Now react to Daniel's revealed pick and see the tally land.
    await user.click(await screen.findByRole('button', { name: /React to Daniel/ }));
    await user.click(screen.getByRole('button', { name: '🔥' }));
    await waitFor(() => {
      expect(container.querySelector('.wc-picks')?.textContent).toContain('🔥');
    });
  });

  it('toggles a quick match reaction on the card', async () => {
    const user = userEvent.setup();
    await seedControlledBoard();
    renderPage();

    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'John' }));
    await user.click(screen.getByRole('button', { name: 'Yes, this is me' }));

    const fire = await screen.findByRole('button', { name: 'React 🔥' });
    await user.click(fire);
    await waitFor(() => expect(fire).toHaveAttribute('aria-pressed', 'true'));
    expect(fire.textContent).toContain('1');

    await user.click(fire);
    await waitFor(() => expect(fire).toHaveAttribute('aria-pressed', 'false'));
    expect(fire.textContent).not.toContain('1');
  });

  it('shows team position and form once games are played', async () => {
    const user = userEvent.setup();
    await seedControlledBoard();
    const { container } = renderPage();

    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}'); // browse without picking a name

    // No context before any game is played.
    expect(container.querySelector('.wc-team-context')).toBeNull();

    // Organiser enters Aland 1–0 Bland.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: /Organiser/ }));
    await user.click(await screen.findByRole('button', { name: 'Home result goals: one more' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('FT');

    // Aland tops the mini-group with a win; Bland sits second.
    await waitFor(() => expect(screen.getByText('1st')).toBeInTheDocument());
    expect(screen.getByText('2nd')).toBeInTheDocument();
    expect(container.querySelector('.wc-form-W')).not.toBeNull();
    expect(container.querySelector('.wc-form-L')).not.toBeNull();
  });

  it('switches a card between Match, Stats and Group views', async () => {
    const user = userEvent.setup();
    await seedControlledBoard();
    renderPage();
    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    // Stats view shows the form & record panel.
    await user.click(await screen.findByRole('tab', { name: 'Stats' }));
    expect(await screen.findByText(/Form & record/)).toBeInTheDocument();

    // Group view shows this group's standings table.
    await user.click(screen.getByRole('tab', { name: 'Group' }));
    expect(await screen.findByText('Group A')).toBeInTheDocument();
  });

  it('shows provisional "if it ends now" points while a match is live', async () => {
    const user = userEvent.setup();
    const past = new Date(Date.now() - 3_600_000).toISOString();
    const wc: WorldCupState = {
      season: '2026',
      title: 'Test Cup',
      version: 9999,
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
          kickoff: past,
          homeId: 'AAA',
          awayId: 'BBB',
        },
      ],
      predictors: [
        { id: 'p1', name: 'John' },
        { id: 'p2', name: 'Daniel' },
      ],
      predictions: [
        { matchId: 'g-A-1', predictorId: 'p1', home: 1, away: 0, updatedAt: past },
        { matchId: 'g-A-1', predictorId: 'p2', home: 2, away: 2, updatedAt: past },
      ],
      createdAt: new Date().toISOString(),
    };
    const { room } = await createRoom({
      name: 'World Cup',
      ownerName: 'Predictions',
      slug: WORLD_CUP_SLUG,
    });
    await getRepository().createRoom({ ...emptyRoomState(room), worldCup: wc });

    const { container } = renderPage();
    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'John' }));
    await user.click(screen.getByRole('button', { name: 'Yes, this is me' }));

    // Simulate the live feed: g-A-1 in play at 1-0.
    act(() => {
      useWorldCupStore.setState({
        live: { 'g-A-1': { status: 'IN_PLAY', minute: 30, home: 1, away: 0 } },
      });
    });

    expect(await screen.findByText(/points if it ends now/i)).toBeInTheDocument();
    // John's 1-0 is spot on → provisional +5 and the live crown.
    await waitFor(() => {
      expect(container.querySelector('.wc-picks')?.textContent).toContain('+5');
    });
    expect(screen.getByTitle('Closest right now')).toBeInTheDocument();
  });

  it('lets you predict the tournament winner on the bracket tab', async () => {
    const user = userEvent.setup();
    await seedControlledBoard();
    const { container } = renderPage();
    await screen.findByRole('heading', { name: /World Cup 2026 Predictions/ });
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'John' }));
    await user.click(screen.getByRole('button', { name: 'Yes, this is me' }));

    await user.click(screen.getByRole('tab', { name: /Bracket/ }));
    await user.selectOptions(await screen.findByLabelText('Your winner:'), 'AAA');

    await waitFor(() => {
      const chip = container.querySelector('.wc-champion-chip');
      expect(chip?.textContent).toContain('John');
      expect(chip?.textContent).toContain('Aland');
    });
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
