import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CountUp } from './CountUp.js';

describe('CountUp', () => {
  it('shows the value immediately on first render (no count from zero)', () => {
    render(<CountUp value={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('settles on the final value after it changes', async () => {
    // A 1ms duration lets the first animation frame land exactly on the target,
    // keeping the assertion independent of jsdom's rAF clock speed.
    const { rerender } = render(<CountUp value={0} durationMs={1} />);
    rerender(<CountUp value={10} durationMs={1} />);
    await waitFor(() => expect(screen.getByText('10')).toBeInTheDocument());
  });

  it('applies the provided formatter', () => {
    render(<CountUp value={5} format={(n) => `$${n.toFixed(0)}`} />);
    expect(screen.getByText('$5')).toBeInTheDocument();
  });
});
