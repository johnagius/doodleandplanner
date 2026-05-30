import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TiltCard, tiltVars } from './TiltCard.js';

describe('tiltVars', () => {
  it('maps pointer position to rotation + glare vars', () => {
    expect(tiltVars(0.75, 0.25, 7)).toEqual({
      '--ry': '3.5deg',
      '--rx': '3.5deg',
      '--mx': '75%',
      '--my': '25%',
    });
  });

  it('is neutral at the centre', () => {
    expect(tiltVars(0.5, 0.5, 7)).toEqual({
      '--ry': '0deg',
      '--rx': '0deg',
      '--mx': '50%',
      '--my': '50%',
    });
  });
});

describe('TiltCard', () => {
  it('renders children with the tilt class and forwards className', () => {
    render(<TiltCard className="feature-card">Hi</TiltCard>);
    const el = screen.getByText('Hi');
    expect(el).toHaveClass('tilt');
    expect(el).toHaveClass('feature-card');
  });

  it('resets tilt vars on pointer leave', () => {
    render(<TiltCard>Card</TiltCard>);
    const el = screen.getByText('Card');
    fireEvent.pointerLeave(el);
    expect(el.style.getPropertyValue('--tilt')).toBe('0');
    expect(el.style.getPropertyValue('--rx')).toBe('0deg');
    expect(el.style.getPropertyValue('--ry')).toBe('0deg');
  });
});
