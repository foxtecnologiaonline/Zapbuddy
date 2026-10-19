import { describe, expect, it } from 'vitest';
import { MONTHLY_PRICE_CENTS, formatMonthlyPriceBRL } from './plan.js';

describe('plan', () => {
  it('preço mensal decidido é R$ 27,90', () => {
    expect(MONTHLY_PRICE_CENTS).toBe(2790);
    expect(formatMonthlyPriceBRL().replace(/ /g, ' ')).toBe('R$ 27,90');
  });
});
