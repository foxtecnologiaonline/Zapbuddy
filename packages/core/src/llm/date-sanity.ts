/**
 * Rede de segurança determinística contra data claramente errada que o
 * modelo tenha extraído mal da linguagem natural (ex.: ano trocado, "sexta"
 * resolvida pro passado). Deliberadamente NÃO é um parser de data — o modelo
 * já resolve a data relativa usando a âncora "Agora é..." do system prompt
 * (system-prompt.ts); isto só rejeita o resultado quando ele é
 * implausível, sem tentar entender a frase original. Ver suggestion #9 da
 * revisão de performance/conhecimento: trocado por este guard mais simples
 * em vez de um parser PT-BR dedicado (chrono-node) — cobre o mesmo risco
 * prático (lembrete/transação na data errada) sem dependência nova.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function assertDateWithinRange(
  iso: string,
  fieldName: string,
  { minMs, maxMs }: { minMs: number; maxMs: number },
): void {
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) {
    throw new Error(`${fieldName} não é uma data válida: "${iso}".`);
  }

  const now = Date.now();
  if (timestamp < minMs || timestamp > maxMs) {
    throw new Error(
      `${fieldName} ("${iso}") está fora do intervalo plausível (${new Date(minMs).toISOString()} a ` +
        `${new Date(maxMs).toISOString()}) — provável erro de interpretação da data. Confirme a data certa ` +
        `com a pessoa antes de tentar de novo.`,
    );
  }
  void now;
}

/**
 * Pra remind_at (lembrete) e due_at (tarefa) quando devem ficar no futuro:
 * tolera até 2 minutos no passado (clock skew entre "agora" calculado no
 * system prompt e o instante real da chamada) e até 2 anos no futuro —
 * acima disso é quase certamente um erro de ano/mês, não um pedido real.
 */
export function assertFutureDate(iso: string, fieldName: string): void {
  const now = Date.now();
  assertDateWithinRange(iso, fieldName, {
    minMs: now - 2 * 60 * 1000,
    maxMs: now + 2 * 365 * ONE_DAY_MS,
  });
}

/**
 * Pra occurred_at (transação): gasto/receita quase sempre é recente — tolera
 * até 1 dia no futuro (fuso/relógio) e até 3 anos no passado (alguém pode
 * legitimamente registrar um gasto antigo esquecido, mas não há como ter
 * ocorrido "no futuro" de verdade).
 */
export function assertReasonableOccurredAt(iso: string, fieldName: string): void {
  const now = Date.now();
  assertDateWithinRange(iso, fieldName, {
    minMs: now - 3 * 365 * ONE_DAY_MS,
    maxMs: now + ONE_DAY_MS,
  });
}

/**
 * Pra due_at (tarefa): mais permissivo que assertFutureDate de propósito —
 * uma tarefa pode legitimamente ter prazo no passado (algo que já venceu e a
 * pessoa só quer registrar). Só rejeita o caso de erro grosseiro de
 * interpretação (ano trocado etc.), não "a data já passou".
 */
export function assertPlausibleTimestamp(iso: string, fieldName: string): void {
  const now = Date.now();
  assertDateWithinRange(iso, fieldName, {
    minMs: now - 10 * 365 * ONE_DAY_MS,
    maxMs: now + 10 * 365 * ONE_DAY_MS,
  });
}
