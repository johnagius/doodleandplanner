import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WelcomeModal } from './WelcomeModal.js';
import { getPreferredName } from '../lib/storage/index.js';

afterEach(() => localStorage.clear());

describe('WelcomeModal', () => {
  it('shows on first load and offers a guest option', () => {
    render(<WelcomeModal />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue as guest/i })).toBeInTheDocument();
  });

  it('remembers the typed name and does not show again after dismissal', () => {
    const { unmount } = render(<WelcomeModal />);
    fireEvent.change(screen.getByPlaceholderText(/how friends know you/i), {
      target: { value: 'Ada' },
    });
    fireEvent.click(screen.getByRole('button', { name: /continue as guest/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(getPreferredName()).toBe('Ada');
    expect(localStorage.getItem('dap:welcomeSeen')).toBe('1');

    unmount();
    render(<WelcomeModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not show when the welcome was already seen', () => {
    localStorage.setItem('dap:welcomeSeen', '1');
    render(<WelcomeModal />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
