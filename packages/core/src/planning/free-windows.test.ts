import { describe, expect, it } from 'vitest';
import { computeFreeWindows } from './free-windows.js';

const H = 3_600_000;
const at = (hour: number) => hour * H;

describe('computeFreeWindows', () => {
  it('vão entre compromissos, com minutos', () => {
    const result = computeFreeWindows([{ startMs: at(9), endMs: at(10) }, { startMs: at(14), endMs: at(15) }], at(8), at(18));
    expect(result.map((w) => [w.startMs / H, w.endMs / H, w.minutes])).toEqual([[8, 9, 60], [10, 14, 240], [15, 18, 180]]);
  });

  it('une compromissos sobrepostos e encostados', () => {
    const result = computeFreeWindows([{ startMs: at(9), endMs: at(11) }, { startMs: at(10), endMs: at(12) }, { startMs: at(12), endMs: at(13) }], at(8), at(14));
    expect(result.map((w) => [w.startMs / H, w.endMs / H])).toEqual([[8, 9], [13, 14]]);
  });

  it('descarta janela menor que o mínimo e corta o que sai do intervalo', () => {
    const result = computeFreeWindows([{ startMs: at(8) + 20 * 60_000, endMs: at(20) }], at(8), at(18));
    expect(result).toEqual([]);
    expect(computeFreeWindows([{ startMs: at(6), endMs: at(9) }], at(8), at(10)).map((w) => [w.startMs / H, w.endMs / H])).toEqual([[9, 10]]);
  });

  it('dia vazio é uma janela só; intervalo invertido não dá nada', () => {
    expect(computeFreeWindows([], at(8), at(20))).toEqual([{ startMs: at(8), endMs: at(20), minutes: 720 }]);
    expect(computeFreeWindows([], at(20), at(8))).toEqual([]);
  });
});
