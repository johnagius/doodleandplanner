import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageRepository, setRepository } from '../../lib/storage/index.js';
import { StageReactions } from './StageReactions.js';
import { WC_LIVE_REACTION_EMOJI } from './wcLiveReactions.js';

beforeEach(() => {
  setRepository(new LocalStorageRepository());
});

describe('StageReactions', () => {
  it('renders a reaction bar and floats your emoji across the screen on tap', async () => {
    const user = userEvent.setup();
    const { container } = render(<StageReactions matchId="m1" />);

    const buttons = screen.getAllByRole('button', { name: /React / });
    expect(buttons).toHaveLength(WC_LIVE_REACTION_EMOJI.length);

    await user.click(buttons[0]!);
    // Optimistic float lands on the stage layer (it never throws without a backend).
    expect(container.querySelector('.wc-stage-fly')).not.toBeNull();
  });
});
