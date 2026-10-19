import { describe, expect, it } from 'vitest';
import { isWithinQuietHours } from './quiet-hours.js';

describe('isWithinQuietHours', () => {
  it('cobre janela que cruza a meia-noite (22h → 7h)', () => {
    expect(isWithinQuietHours(23, 22, 7)).toBe(true);
    expect(isWithinQuietHours(0, 22, 7)).toBe(true);
    expect(isWithinQuietHours(6, 22, 7)).toBe(true);
    expect(isWithinQuietHours(7, 22, 7)).toBe(false);
    expect(isWithinQuietHours(12, 22, 7)).toBe(false);
    expect(isWithinQuietHours(21, 22, 7)).toBe(false);
  });

  it('cobre janela dentro do mesmo dia (13h → 15h)', () => {
    expect(isWithinQuietHours(13, 13, 15)).toBe(true);
    expect(isWithinQuietHours(14, 13, 15)).toBe(true);
    expect(isWithinQuietHours(15, 13, 15)).toBe(false);
    expect(isWithinQuietHours(12, 13, 15)).toBe(false);
  });

  it('start === end desliga a janela', () => {
    expect(isWithinQuietHours(3, 5, 5)).toBe(false);
  });
});
