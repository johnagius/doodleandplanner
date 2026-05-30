import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GoogleSignInButton } from './GoogleSignInButton.js';

describe('GoogleSignInButton', () => {
  it('shows a disabled button when Google is not configured', () => {
    // VITE_GOOGLE_CLIENT_ID is unset under Vitest, so the button is present but
    // disabled with a "soon" hint rather than hidden.
    render(<GoogleSignInButton />);
    const btn = screen.getByRole('button', { name: /Sign in with Google/ });
    expect(btn).toBeDisabled();
  });
});
