import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { WelcomeModal } from './WelcomeModal.js';
import { getPreferredName } from '../lib/storage/index.js';
import { useGoogleStore } from '../state/googleStore.js';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WelcomeModal />
    </MemoryRouter>,
  );
}

afterEach(() => {
  localStorage.clear();
  useGoogleStore.setState({ profile: null, email: null });
});

describe('WelcomeModal', () => {
  it('shows on the home page when signed out', () => {
    renderAt('/');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue as guest/i })).toBeInTheDocument();
  });

  it('remembers the guest name and closes on continue', () => {
    renderAt('/');
    fireEvent.change(screen.getByPlaceholderText(/how friends know you/i), {
      target: { value: 'Ada' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue as guest/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getPreferredName()).toBe('Ada');
  });

  it('does not show when already signed in', () => {
    useGoogleStore.setState({ profile: { email: 'a@b.com', name: 'A' }, email: 'a@b.com' });
    renderAt('/');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not block non-home routes (e.g. invite links)', () => {
    renderAt('/r/some-room');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
