import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClubPosterPage } from './ClubPosterPage.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-11T12:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

function renderPoster() {
  return render(
    <MemoryRouter>
      <ClubPosterPage />
    </MemoryRouter>,
  );
}

describe('ClubPosterPage', () => {
  it('shows the 5-days-to-go countdown and the kick-off date', () => {
    const { getByText } = renderPoster();
    expect(getByText('5')).toBeTruthy();
    expect(getByText(/days to go/i)).toBeTruthy();
    expect(getByText(/Kicks off Sunday,? 16 August 2026/)).toBeTruthy();
  });

  it('shows all ten club crests', () => {
    const { getAllByRole } = renderPoster();
    expect(getAllByRole('img')).toHaveLength(10);
  });

  it('gives a quick rules rundown with the real point values', () => {
    const { getByText } = renderPoster();
    expect(getByText(/Result 1\/X\/2 \(\+3\)/)).toBeTruthy();
    expect(getByText(/Over\/Under 2\.5 \(\+2\)/)).toBeTruthy();
    expect(getByText(/Combinator pays 14/)).toBeTruthy();
    expect(getByText(/promotion and relegation/)).toBeTruthy();
  });

  it('links onto the board', () => {
    const { getByRole } = renderPoster();
    expect(getByRole('link', { name: /Open the board/ }).getAttribute('href')).toBe('/club');
  });
});
