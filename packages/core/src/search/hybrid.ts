/**
 * Busca híbrida (texto exato + significado) de notas e documentos. A busca
 * por texto é a fonte de verdade ("achei exatamente isso"); a semântica só
 * completa com itens parecidos que o texto não pegaria ("aluguel" →
 * "contrato do apartamento"), marcados como `related` pra o Tom não
 * apresentar um palpite como se fosse correspondência exata.
 */

/**
 * Cosseno mínimo (text-embedding-3-small) pra contar como "parecido" — nota
 * ou documento sem relação com a busca fica bem abaixo disso em português.
 * Conservador de propósito: melhor deixar um relacionado de fora que mostrar
 * lixo; o texto exato continua achando o que for literal.
 */
export const SEMANTIC_MIN_SIMILARITY = 0.3;
export const SEMANTIC_RELATED_LIMIT = 5;

export type MatchKind = 'exact' | 'related';

/** Exatos primeiro (na ordem recebida), depois os relacionados que não repetem um exato; corta em `limit`. */
export function mergeHybridResults<Exact extends { id: string }, Related extends { id: string }>(
  exact: Exact[],
  related: Related[],
  limit: number,
): Array<{ item: Exact | Related; match: MatchKind }> {
  const seen = new Set(exact.map((item) => item.id));
  const merged: Array<{ item: Exact | Related; match: MatchKind }> = exact.map((item) => ({ item, match: 'exact' }));
  for (const item of related) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push({ item, match: 'related' });
  }
  return merged.slice(0, limit);
}
