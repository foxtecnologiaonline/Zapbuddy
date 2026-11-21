import { getSupabaseClient } from '../client.js';
import {
  CORRECTION_WINDOW_MS,
  buildReviewSnapshot,
  detectCurationCases,
  redactSensitive,
  validateReviewInput,
  type CurationCase,
  type CurationDestination,
  type CurationScan,
  type CurationSignal,
  type CurationVerdict,
} from '../curation.js';
import type { ToolCallLog } from '../types.js';
import { MAX_TOOL_CALL_LOGS_PER_RANGE, listToolCallLogsInRange } from './tool-call-logs.js';

export interface CurationReview {
  logId: string;
  signal: CurationSignal;
  verdict: CurationVerdict;
  destination: CurationDestination | null;
  note: string | null;
  snapshot: Record<string, unknown>;
  reviewedAt: string;
}

interface ReviewRow {
  tool_call_log_id: string;
  signal: CurationSignal;
  verdict: CurationVerdict;
  destination: CurationDestination | null;
  note: string | null;
  snapshot: Record<string, unknown>;
  reviewed_at: string;
}

function toReview(row: ReviewRow): CurationReview {
  return {
    logId: row.tool_call_log_id,
    signal: row.signal,
    verdict: row.verdict,
    destination: row.destination,
    note: row.note,
    snapshot: row.snapshot,
    reviewedAt: row.reviewed_at,
  };
}

/** A migration 0030 ainda não foi aplicada: a página avisa em vez de quebrar (mesma tolerância do painel de recados). */
export class CurationTableMissingError extends Error {
  constructor() {
    super('A tabela curation_reviews não existe: aplique a migration 0030_curation_reviews.sql no Supabase.');
  }
}

/** O caso não existe mais: o log foi apagado (retenção de 90 dias) ou o sinal não se aplica mais. */
export class CurationCaseNotFoundError extends Error {
  constructor() {
    super('Caso não encontrado: o log foi apagado ou o sinal não se aplica mais.');
  }
}

export class CurationInvalidReviewError extends Error {}

function isMissingTable(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  if (code === '42P01' || code === 'PGRST205') return true;
  return /curation_reviews/.test(message ?? '') && /(does not exist|schema cache|could not find)/i.test(message ?? '');
}

/** `.in()` vira parte da URL: lotes pequenos evitam estourar o tamanho dela. */
const IN_CHUNK = 100;

export interface CurationQueue {
  scan: CurationScan;
  /** Vereditos já dados, por id do log. */
  reviews: Map<string, CurationReview>;
  /** false = migration 0030 pendente (a fila aparece, mas não dá pra salvar veredito). */
  reviewsAvailable: boolean;
  days: number;
  /** true = a janela tem mais chamadas que o teto de leitura: os casos mais antigos podem faltar. */
  truncated: boolean;
}

/** Fila de curadoria dos últimos `days` dias: casos detectados + vereditos já dados. Só leitura. */
export async function getCurationQueue(days = 14, now: Date = new Date()): Promise<CurationQueue> {
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const logs = await listToolCallLogsInRange(from, now.toISOString());
  const scan = detectCurationCases(logs);

  const reviews = new Map<string, CurationReview>();
  let reviewsAvailable = true;
  const ids = scan.cases.map((item) => item.logId);

  for (let i = 0; i < ids.length && reviewsAvailable; i += IN_CHUNK) {
    const { data, error } = await getSupabaseClient()
      .from('curation_reviews')
      .select('*')
      .in('tool_call_log_id', ids.slice(i, i + IN_CHUNK));
    if (error) {
      if (!isMissingTable(error)) throw error;
      reviewsAvailable = false;
      break;
    }
    for (const row of (data ?? []) as ReviewRow[]) reviews.set(row.tool_call_log_id, toReview(row));
  }

  // Sem nenhum caso não há o que consultar; checa se a tabela existe só pra a página saber se aceita veredito.
  if (ids.length === 0) {
    const { error } = await getSupabaseClient().from('curation_reviews').select('tool_call_log_id', { head: true, count: 'exact' }).limit(1);
    if (error) {
      if (!isMissingTable(error)) throw error;
      reviewsAvailable = false;
    }
  }

  return { scan, reviews, reviewsAvailable, days, truncated: logs.length >= MAX_TOOL_CALL_LOGS_PER_RANGE };
}

export interface SaveCurationReviewInput {
  logId: string;
  verdict: string;
  destination: string | null;
  note: string | null;
}

/**
 * Grava (ou refaz) o veredito de um caso. O caso é reconstruído no servidor a partir do log, nunca aceito do
 * formulário: assim o que fica guardado (sinal, resumo, trecho mascarado) é o que o sistema detectou.
 */
export async function saveCurationReview(input: SaveCurationReviewInput): Promise<CurationCase> {
  const note = input.note === null || input.note.trim() === '' ? null : input.note.trim();
  const problem = validateReviewInput({ verdict: input.verdict, destination: input.destination, note });
  if (problem) throw new CurationInvalidReviewError(problem);

  const client = getSupabaseClient();
  const { data: logRow, error: logError } = await client.from('tool_call_logs').select('*').eq('id', input.logId).maybeSingle();
  if (logError) throw logError;
  if (!logRow) throw new CurationCaseNotFoundError();
  const log = logRow as ToolCallLog;

  // Os vizinhos recentes do mesmo usuário são necessários pro sinal "corrigido logo depois", que depende da criação anterior.
  let logs: ToolCallLog[] = [log];
  if (log.user_id) {
    const windowStart = new Date(new Date(log.created_at).getTime() - CORRECTION_WINDOW_MS).toISOString();
    const { data: neighbors, error: neighborsError } = await client
      .from('tool_call_logs')
      .select('*')
      .eq('user_id', log.user_id)
      .gte('created_at', windowStart)
      .lte('created_at', log.created_at);
    if (neighborsError) throw neighborsError;
    const byId = new Map<string, ToolCallLog>([[log.id, log]]);
    for (const neighbor of (neighbors ?? []) as ToolCallLog[]) byId.set(neighbor.id, neighbor);
    logs = [...byId.values()];
  }

  const curationCase = detectCurationCases(logs).cases.find((item) => item.logId === log.id);
  if (!curationCase) throw new CurationCaseNotFoundError();

  const { error } = await client.from('curation_reviews').upsert(
    {
      tool_call_log_id: log.id,
      signal: curationCase.signal,
      verdict: input.verdict,
      destination: input.verdict === 'errou' ? input.destination : null,
      note: note === null ? null : redactSensitive(note),
      snapshot: buildReviewSnapshot(curationCase),
      reviewed_at: new Date().toISOString(),
    },
    { onConflict: 'tool_call_log_id' },
  );
  if (error) {
    if (isMissingTable(error)) throw new CurationTableMissingError();
    throw error;
  }
  return curationCase;
}

/** Vereditos dados, do mais recente pro mais antigo — alimenta a exportação (o que virou prompt, categoria, bug ou caso de teste). */
export async function listCurationReviews(limit = 5000): Promise<CurationReview[]> {
  const { data, error } = await getSupabaseClient().from('curation_reviews').select('*').order('reviewed_at', { ascending: false }).limit(limit);
  if (error) {
    if (isMissingTable(error)) throw new CurationTableMissingError();
    throw error;
  }
  return ((data ?? []) as ReviewRow[]).map(toReview);
}
