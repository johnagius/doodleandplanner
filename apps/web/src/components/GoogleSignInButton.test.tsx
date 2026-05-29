import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GoogleSignInButton } from './GoogleSignInButton.js';

describe('GoogleSignInButton', () => {
  it('renders nothing when Google is not configured (no client id in tests)', () => {
    const { container } = render(<GoogleSignInButton />);
    // VITE_GOOGLE_CLIENT_ID is unset under Vitest, so the button self-hides.
    expect(container).toBeEmptyDOMElement();
  });
});
