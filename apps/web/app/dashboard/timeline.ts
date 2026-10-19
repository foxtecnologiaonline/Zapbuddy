export interface TimelineEntry {
  id: string;
  kind: 'transacao' | 'tarefa' | 'nota' | 'fato' | 'meta';
  label: string;
  at: string;
}

const DEFAULT_TIMELINE_LIMIT = 12;

/**
 * Mescla entradas de fontes diferentes (transação, tarefa, nota, fato,
 * meta) numa única linha do tempo ordenada por data — pura/testável de
 * propósito (mesmo padrão de trend.ts): quem monta cada TimelineEntry com
 * seu label já formatado é o caller (page.tsx), que já tem formatCents e
 * contexto de cada tipo. Isto só mescla e ordena.
 */
export function buildTimeline(entries: TimelineEntry[], limit: number = DEFAULT_TIMELINE_LIMIT): TimelineEntry[] {
  return [...entries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);
}
