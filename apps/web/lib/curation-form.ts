import { CURATION_DESTINATIONS, CURATION_VERDICTS, DESTINATION_LABELS, VERDICT_LABELS } from '@zapbuddy/db';

/** Opções do único <select> do formulário de revisão: "acertou", "ruido" ou "errou:<destino>". */
export const OUTCOME_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'acertou', label: VERDICT_LABELS.acertou },
  { value: 'ruido', label: VERDICT_LABELS.ruido },
  ...CURATION_DESTINATIONS.map((destination) => ({ value: `errou:${destination}`, label: `Tom errou → ${DESTINATION_LABELS[destination]}` })),
];

export function parseOutcome(outcome: string): { verdict: string; destination: string | null } {
  const [verdict = '', destination] = outcome.split(':');
  return { verdict, destination: destination ?? null };
}

/** Valor do <select> a partir de uma revisão já feita (pra "refazer" abrir já no veredito atual). */
export function outcomeValue(review: { verdict: string; destination: string | null }): string {
  return review.verdict === 'errou' && review.destination ? `errou:${review.destination}` : review.verdict;
}

/** Só volta pra dentro da própria curadoria (mantém os filtros da fila); qualquer outra coisa cai na página base — sem open redirect. */
export function safeBackPath(value: unknown): string {
  return typeof value === 'string' && /^\/admin\/curadoria(\?[\w=&%.-]*)?$/.test(value) ? value : '/admin/curadoria';
}

export { CURATION_VERDICTS };
