/**
 * Registro das tool calls já executadas num turno (uma mensagem da pessoa), pra um turno reexecutado NÃO repetir o efeito.
 *
 * Por que existe: o turno pode rodar mais de uma vez com a MESMA mensagem — (1) o Claude executa `record_transaction` e a
 * chamada seguinte à API falha, aí o fallback (OpenAI) recomeça do zero e chama a tool de novo; (2) o job do BullMQ tenta de
 * novo (3 tentativas) depois de uma falha no meio. Sem isto, o gasto/tarefa/lembrete saía duplicado e o Tom confirmava os dois.
 *
 * Como funciona: cada tool call BEM-SUCEDIDA é gravada (nome + argumentos → resultado). Numa nova tentativa do mesmo turno
 * (`startAttempt`), uma chamada idêntica a uma já gravada devolve o resultado gravado em vez de executar. Chamada nova (o outro
 * modelo decidiu algo diferente) executa normalmente. Chamadas iguais DENTRO da mesma tentativa nunca são deduplicadas: o que
 * a própria tentativa grava já nasce "consumido", então dois gastos iguais pedidos de propósito ("10 no café e 10 no café")
 * continuam sendo dois. Não depende da ordem (chamadas em paralelo terminam em ordem variável), nem de classificar tools em
 * "leitura/escrita": repetir o mesmo prefixo de chamadas é exatamente o que um turno reexecutado faz.
 *
 * Fica em memória do worker, não no Redis: a cota do Upstash já estourou por comando (CLAUDE.md), e o retry do BullMQ (backoff
 * de 5–20s) roda no mesmo processo. Um crash do worker no meio do turno perde o registro — risco aceito, é o caso raro.
 */

interface LedgerEntry {
  key: string;
  content: string;
  used: boolean;
}

/** JSON com chaves em ordem estável: os mesmos argumentos sempre geram a mesma chave, em qualquer ordem de propriedades. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

function keyOf(name: string, input: unknown): string {
  return `${name}\u0000${stableStringify(input)}`;
}

/** Resultados enormes (uma listagem longa) não valem a memória: sem registro, a chamada só executa de novo — como antes. */
const MAX_CONTENT_CHARS = 20_000;

export class TurnLedger {
  private entries: LedgerEntry[] = [];

  /** Início de cada tentativa do turno (cada provider, cada retry do job): tudo que já foi gravado volta a estar disponível. */
  startAttempt(): void {
    for (const entry of this.entries) entry.used = false;
  }

  /** Resultado gravado de uma chamada idêntica ainda não consumida nesta tentativa, ou null (executa de verdade). */
  replay(name: string, input: unknown): string | null {
    const key = keyOf(name, input);
    const entry = this.entries.find((item) => !item.used && item.key === key);
    if (!entry) return null;
    entry.used = true;
    return entry.content;
  }

  /** Só chamadas bem-sucedidas: falha não gerou efeito, então repetir é o certo. Nasce consumida (a própria tentativa já a viveu). */
  record(name: string, input: unknown, content: string): void {
    if (content.length > MAX_CONTENT_CHARS) return;
    this.entries.push({ key: keyOf(name, input), content, used: true });
  }

  get size(): number {
    return this.entries.length;
  }
}

const LEDGER_TTL_MS = 30 * 60 * 1000;
const MAX_LEDGERS = 500;
const ledgers = new Map<string, { ledger: TurnLedger; expiresAt: number }>();

/**
 * Devolve o registro do turno identificado por `turnKey` (o id da mensagem do WhatsApp), criando se não houver. É o que liga uma
 * nova tentativa do job ao que a anterior já executou. Limpa o que expirou e limita o total, pra não crescer sem fim.
 */
export function acquireTurnLedger(turnKey: string, now: number = Date.now()): TurnLedger {
  for (const [key, item] of ledgers) {
    if (item.expiresAt <= now) ledgers.delete(key);
  }

  const existing = ledgers.get(turnKey);
  if (existing) {
    existing.expiresAt = now + LEDGER_TTL_MS;
    return existing.ledger;
  }

  while (ledgers.size >= MAX_LEDGERS) {
    const oldest = ledgers.keys().next().value;
    if (oldest === undefined) break;
    ledgers.delete(oldest);
  }
  const ledger = new TurnLedger();
  ledgers.set(turnKey, { ledger, expiresAt: now + LEDGER_TTL_MS });
  return ledger;
}

/** Só pra testes. */
export function resetTurnLedgers(): void {
  ledgers.clear();
}
