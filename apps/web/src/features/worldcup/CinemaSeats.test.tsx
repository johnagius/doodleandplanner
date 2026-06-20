import type { WorldCupState } from '@dap/shared';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CinemaSeats } from './CinemaSeats.js';
import type { Bubble } from './useCommentBubbles.js';
import type { Watcher } from './useWatchers.js';

const wc = {
  predictors: [
    { id: 'p1', name: 'John' },
    { id: 'p2', name: 'Sara' },
  ],
} as unknown as WorldCupState;

const watcher = (id: string, name: string | null): Watcher => ({
  memberId: id,
  name,
  at: Date.now(),
});

describe('CinemaSeats', () => {
  it('seats me + watchers and fills the rest with empty red seats', () => {
    const { container } = render(
      <CinemaSeats wc={wc} me={{ id: 'p1', name: 'John' }} watchers={[watcher('p2', 'Sara')]} />,
    );
    expect(container.querySelectorAll('.wc-seat.is-taken')).toHaveLength(2);
    expect(container.querySelector('.wc-seat.is-me')).not.toBeNull();
    expect(container.textContent).toContain('You');
    expect(container.textContent).toContain('Sara');
    expect(container.querySelectorAll('.wc-seat-empty')).toHaveLength(8); // 10 − 2
    expect(container.querySelector('.wc-amphi-caption')?.textContent).toMatch(/2 in the house/);
  });

  it('caps the crowd at 10 seats with none empty when full', () => {
    const many = Array.from({ length: 15 }, (_, i) => watcher(`anon-${i}`, `Fan${i}`));
    const { container } = render(
      <CinemaSeats wc={wc} me={{ id: 'p1', name: 'John' }} watchers={many} />,
    );
    expect(container.querySelectorAll('.wc-seat.is-taken')).toHaveLength(10);
    expect(container.querySelectorAll('.wc-seat-empty')).toHaveLength(0);
  });

  it('shows an initial for an anonymous (non-predictor) watcher', () => {
    const { container } = render(
      <CinemaSeats wc={wc} me={null} watchers={[watcher('anon-x', 'Zoe')]} />,
    );
    expect(container.querySelector('.wc-seat-anon')?.textContent).toBe('Z');
  });

  it("pops a speech bubble from the commenter's seat (seating them if needed)", () => {
    const bubbles: Bubble[] = [{ id: 'm1', authorId: 'p2', name: 'Sara', text: 'GOOO!' }];
    const { container } = render(
      <CinemaSeats wc={wc} me={{ id: 'p1', name: 'John' }} watchers={[]} bubbles={bubbles} />,
    );
    // p2 wasn't formally watching but gets a seat so the bubble has a home.
    expect(container.querySelectorAll('.wc-seat.is-taken')).toHaveLength(2);
    expect(container.querySelector('.wc-seat-bubble')?.textContent).toBe('GOOO!');
  });
});
