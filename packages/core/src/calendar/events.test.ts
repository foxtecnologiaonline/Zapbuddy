import { describe, expect, it } from 'vitest';
import { blocksTime, isAllDayStart, nearestUtcDate } from './events.js';

describe('nearestUtcDate — dia inteiro do Graph em qualquer fuso', () => {
  it('meia-noite local deslocada pra UTC cai no dia certo (Brasília, UTC, e fusos à frente de UTC)', () => {
    expect(nearestUtcDate('2026-11-21T03:00:00.0000000Z')).toBe('2026-11-21'); // 00:00 em Brasília (UTC-3)
    expect(nearestUtcDate('2026-11-21T00:00:00.0000000Z')).toBe('2026-11-21'); // UTC
    expect(nearestUtcDate('2026-11-20T22:00:00.0000000Z')).toBe('2026-11-21'); // 00:00 em UTC+2: já é dia 21 lá
    expect(nearestUtcDate('2026-11-20T14:00:00.0000000Z')).toBe('2026-11-21'); // 00:00 em UTC+10 (Sydney)
    expect(nearestUtcDate('2026-11-21T11:00:00.0000000Z')).toBe('2026-11-21'); // 00:00 em UTC-11
  });
});

describe('isAllDayStart / blocksTime', () => {
  it('só a data (sem "T") é dia inteiro', () => {
    expect(isAllDayStart('2026-11-21')).toBe(true);
    expect(isAllDayStart('2026-11-21T10:00:00.000Z')).toBe(false);
  });

  it('só ocupa horário: com hora marcada e não livre/recusado', () => {
    expect(blocksTime({ startIso: '2026-11-21T10:00:00.000Z' })).toBe(true);
    expect(blocksTime({ startIso: '2026-11-21T10:00:00.000Z', busy: true })).toBe(true);
    expect(blocksTime({ startIso: '2026-11-21T10:00:00.000Z', busy: false })).toBe(false);
    expect(blocksTime({ startIso: '2026-11-21', busy: true })).toBe(false); // dia inteiro nunca bloqueia
  });
});
