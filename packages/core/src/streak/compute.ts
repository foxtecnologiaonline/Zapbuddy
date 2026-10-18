import { listTransactions } from '@zapbuddy/db';

// Teto de segurança pra busca — ninguém tem streak real maior que isso sem
// nunca ter um dia de folga; limita o tamanho da query, não o streak em si
// (um streak mais longo que isso simplesmente não é detectado, o que é
// aceitável pro propósito de reconhecimento, não de registro histórico).
const LOOKBACK_DAYS = 60;

/**
 * Data local (YYYY-MM-DD) no fuso informado — locale en-CA formata assim
 * nativamente, sem precisar montar a string campo a campo.
 */
function toLocalDateKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/**
 * Dias consecutivos (até hoje, ou até ontem se hoje ainda não tem registro —
 * não quebra um streak em andamento só porque a pessoa ainda não mandou
 * mensagem hoje) com pelo menos uma transação. Pura (sem I/O), testável sem
 * mock de banco — `getCurrentStreakDays` abaixo é quem busca o dado real.
 *
 * Limitação conhecida e aceita: anda de 24h em 24h em tempo absoluto (UTC) e
 * lê a data local a cada passo — correto pra fusos sem DST (ex.:
 * America/Sao_Paulo desde 2019) e praticamente sempre correto mesmo com DST,
 * mas um fuso que ainda observasse DST poderia, em tese, pular ou repetir um
 * dia bem na troca de horário — caso raríssimo, não tratado de propósito
 * pelo mesmo motivo do arredondamento de mês em time/recurrence.ts.
 */
export function computeStreakDays(occurredAtIsos: string[], timeZone: string, now: Date = new Date()): number {
  const datesWithActivity = new Set(occurredAtIsos.map((iso) => toLocalDateKey(iso, timeZone)));

  let cursor = now;
  if (!datesWithActivity.has(toLocalDateKey(cursor.toISOString(), timeZone))) {
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }

  let streak = 0;
  while (datesWithActivity.has(toLocalDateKey(cursor.toISOString(), timeZone))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 24 * 60 * 60 * 1000);
  }
  return streak;
}

/** Busca as transações recentes da conta e calcula o streak atual — usado por orchestrator.ts pra alimentar o system prompt. */
export async function getCurrentStreakDays(accountId: string, timeZone: string, now: Date = new Date()): Promise<number> {
  const fromIso = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = await listTransactions(accountId, fromIso, now.toISOString(), { columns: 'occurred_at' });
  return computeStreakDays(
    rows.map((row) => row.occurred_at),
    timeZone,
    now,
  );
}
