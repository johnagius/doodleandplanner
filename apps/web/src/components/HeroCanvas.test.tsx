import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HeroCanvas } from './HeroCanvas.js';

describe('HeroCanvas', () => {
  it('renders a canvas and degrades gracefully without WebGL (jsdom)', () => {
    // jsdom returns null for getContext('webgl'); the component must not throw.
    expect(() => render(<HeroCanvas className="hero-canvas" />)).not.toThrow();
    const canvas = screen.getByTestId('hero-canvas');
    expect(canvas.tagName).toBe('CANVAS');
    expect(canvas).toHaveClass('hero-canvas');
  });
});
