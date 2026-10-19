import { describe, expect, it } from 'vitest';
import { buildTimeline, type TimelineEntry } from './timeline.js';

describe('buildTimeline', () => {
  it('ordena por data decrescente, misturando tipos diferentes', () => {
    const entries: TimelineEntry[] = [
      { id: '1', kind: 'transacao', label: 'mercado', at: '2026-10-01T10:00:00Z' },
      { id: '2', kind: 'nota', label: 'lembrar de X', at: '2026-10-03T10:00:00Z' },
      { id: '3', kind: 'tarefa', label: 'ligar pro contador', at: '2026-10-02T10:00:00Z' },
    ];

    const result = buildTimeline(entries);

    expect(result.map((e) => e.id)).toEqual(['2', '3', '1']);
  });

  it('respeita o limite', () => {
    const entries: TimelineEntry[] = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      kind: 'nota' as const,
      label: `nota ${i}`,
      at: new Date(2026, 0, i + 1).toISOString(),
    }));

    const result = buildTimeline(entries, 5);

    expect(result).toHaveLength(5);
  });
});
