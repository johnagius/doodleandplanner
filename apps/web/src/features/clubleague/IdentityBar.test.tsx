// @vitest-environment jsdom
import { seedClubLeague, type ClubLeagueState } from '@dap/shared';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useClubLeagueStore } from '../../state/clubLeagueStore.js';
import { IdentityBar } from './IdentityBar.js';

afterEach(() => {
  cleanup();
  useClubLeagueStore.setState({ meId: null });
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

function board(): ClubLeagueState {
  const s = seedClubLeague(() => new Date('2026-08-01T00:00:00.000Z'));
  // Claim the first player (server would set this once their email is verified).
  s.predictors = s.predictors.map((p, i) => (i === 0 ? { ...p, claimed: true } : p));
  return s;
}

describe('IdentityBar device lock', () => {
  it('greys out every other player once you are logged in on this device', () => {
    const club = board();
    const me = club.predictors[0]!;
    // A persisted session for me on this device (any non-empty token counts).
    localStorage.setItem(`dap:wc:session:${me.id}`, 'header.sig');
    useClubLeagueStore.setState({ meId: me.id });

    const { getByText } = render(<IdentityBar club={club} onClaim={() => {}} />);

    // I'm selectable (that's me); everyone else is disabled.
    const meChip = getByText(new RegExp(me.name)).closest('button')!;
    expect(meChip.hasAttribute('disabled')).toBe(false);
    for (const other of club.predictors.slice(1)) {
      const chip = getByText(new RegExp(`^(🔒 )?${other.name}$`)).closest('button')!;
      expect(chip.hasAttribute('disabled')).toBe(true);
    }
    // And the privacy state is surfaced.
    expect(getByText(/Private to you/)).toBeTruthy();
  });

  it('leaves all players selectable when nobody is logged in here', () => {
    const club = board(); // player 0 is claimed but this device has no session
    useClubLeagueStore.setState({ meId: null });
    const { getByText } = render(<IdentityBar club={club} onClaim={() => {}} />);
    // The claimed player shows a lock but is still tappable (to log in).
    const chip = getByText(new RegExp(`${club.predictors[0]!.name}`)).closest('button')!;
    expect(chip.hasAttribute('disabled')).toBe(false);
  });
});
