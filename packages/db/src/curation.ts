import type { ToolCallLog } from './types.js';

/**
 * Curadoria das interações (docs/adr/0011): transforma o que o Tom já registra em `tool_call_logs` numa fila
 * de casos pra uma pessoa revisar. Lógica pura (sem IO) pra ser testável e pra deixar explícito O QUE é um
 * sinal — cada um é um jeito da pessoa dizer, sem falar, que a interpretação do Tom não era a que ela queria.
 *
 * Só usa dado que já existe (nenhum texto novo de conversa é guardado). Por isso o que dá pra curar aqui são as
 * INTERPRETAÇÕES (o que o Tom entendeu e executou), não as frases da pessoa nem as respostas do Tom.
 */

export type CurationSignal = 'undone' | 'failed' | 'corrected' | 'category_fallback';

/** Menor número = revisar primeiro. Desfazer é o sinal mais forte: a pessoa viu o resultado e não quis. */
export const SIGNAL_PRIORITY: Record<CurationSignal, number> = {
  undone: 1,
  failed: 2,
  corrected: 3,
  category_fallback: 4,
};

export const SIGNAL_LABELS: Record<CurationSignal, string> = {
  undone: 'Pessoa desfez',
  failed: 'Tool falhou',
  corrected: 'Corrigido logo depois',
  category_fallback: 'Categoria desconhecida',
};

/** Janela em que editar algo recém-criado conta como "o Tom entendeu errado"; depois disso é só a pessoa mudando de ideia. */
export const CORRECTION_WINDOW_MS = 10 * 60_000;

const CREATION_TOOLS = new Set(['record_transaction', 'create_task', 'create_note', 'create_reminder', 'create_calendar_event']);
const CORRECTION_TOOLS = new Set(['correct_last_transaction', 'update_task', 'update_note', 'update_reminder', 'update_calendar_event']);

export interface CurationCase {
  logId: string;
  userId: string | null;
  toolName: string;
  signal: CurationSignal;
  priority: number;
  at: string;
  /** Frase curta do que aconteceu, pra triagem rápida. */
  summary: string;
  parameters: Record<string, unknown>;
  result: unknown;
  error: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Qual sinal (o mais forte) esse log dispara, ou null. `recentCreation` = criação do mesmo usuário nos 10 min anteriores. */
function classify(log: ToolCallLog, recentCreation: ToolCallLog | undefined): { signal: CurationSignal; summary: string } | null {
  const result = asRecord(log.result);
  const candidates: Array<{ signal: CurationSignal; summary: string }> = [];

  if (log.tool_name === 'undo_last_action' && log.success && result?.undone === true) {
    candidates.push({ signal: 'undone', summary: `Pessoa desfez "${String(result.undone_action ?? 'ação')}"` });
  }

  if (!log.success) {
    candidates.push({ signal: 'failed', summary: log.error ? `Falhou: ${log.error}` : 'Falhou sem mensagem de erro' });
  }

  if (CORRECTION_TOOLS.has(log.tool_name) && log.success && result?.corrected !== false && recentCreation) {
    const seconds = Math.round((new Date(log.created_at).getTime() - new Date(recentCreation.created_at).getTime()) / 1000);
    candidates.push({ signal: 'corrected', summary: `${log.tool_name} ${seconds}s depois de ${recentCreation.tool_name}` });
  }

  if ((log.tool_name === 'record_transaction' || log.tool_name === 'correct_last_transaction') && log.success && result?.category_fallback === true) {
    const category = log.parameters.category;
    candidates.push({ signal: 'category_fallback', summary: `Categoria "${typeof category === 'string' ? category : '?'}" não existe: caiu em "outros"` });
  }

  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => SIGNAL_PRIORITY[a.signal] - SIGNAL_PRIORITY[b.signal])[0]!;
}

export interface CurationScan {
  cases: CurationCase[];
  /** Quantas tool calls entraram na varredura (denominador da taxa de sinais). */
  callsTotal: number;
  countsBySignal: Record<CurationSignal, number>;
}

/**
 * Varre os logs e devolve os casos a revisar, do mais urgente ao menos (prioridade, depois o mais recente).
 * Um log gera no máximo um caso, com o sinal mais forte. Não importa a ordem de entrada.
 */
export function detectCurationCases(logs: ToolCallLog[]): CurationScan {
  const ascending = [...logs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const lastCreationByUser = new Map<string, ToolCallLog>();
  const cases: CurationCase[] = [];
  const countsBySignal: Record<CurationSignal, number> = { undone: 0, failed: 0, corrected: 0, category_fallback: 0 };

  for (const log of ascending) {
    const lastCreation = log.user_id ? lastCreationByUser.get(log.user_id) : undefined;
    const recentCreation =
      lastCreation && new Date(log.created_at).getTime() - new Date(lastCreation.created_at).getTime() <= CORRECTION_WINDOW_MS ? lastCreation : undefined;

    const hit = classify(log, recentCreation);
    if (hit) {
      countsBySignal[hit.signal] += 1;
      cases.push({
        logId: log.id,
        userId: log.user_id,
        toolName: log.tool_name,
        signal: hit.signal,
        priority: SIGNAL_PRIORITY[hit.signal],
        at: log.created_at,
        summary: hit.summary,
        parameters: log.parameters,
        result: log.result,
        error: log.error,
      });
    }

    if (log.user_id && log.success && CREATION_TOOLS.has(log.tool_name)) lastCreationByUser.set(log.user_id, log);
  }

  cases.sort((a, b) => a.priority - b.priority || new Date(b.at).getTime() - new Date(a.at).getTime());
  return { cases, callsTotal: logs.length, countsBySignal };
}

/** Sinais por 100 chamadas: o número que mostra se uma mudança de prompt/regra melhorou ou piorou as coisas. */
export function signalRatePer100(scan: Pick<CurationScan, 'cases' | 'callsTotal'>): number | null {
  return scan.callsTotal === 0 ? null : (scan.cases.length / scan.callsTotal) * 100;
}

export const CURATION_VERDICTS = ['acertou', 'errou', 'ruido'] as const;
export type CurationVerdict = (typeof CURATION_VERDICTS)[number];

/** Pra onde o caso vai quando o Tom errou: define a ação, não só o rótulo. */
export const CURATION_DESTINATIONS = ['prompt', 'categoria', 'bug', 'exemplo'] as const;
export type CurationDestination = (typeof CURATION_DESTINATIONS)[number];

export const VERDICT_LABELS: Record<CurationVerdict, string> = {
  acertou: 'Tom acertou (sinal enganou)',
  errou: 'Tom errou',
  ruido: 'Ruído (sem ação)',
};

export const DESTINATION_LABELS: Record<CurationDestination, string> = {
  prompt: 'Ajustar prompt/regra',
  categoria: 'Categoria ou alias novo',
  bug: 'Bug de tool',
  exemplo: 'Virar caso de teste/exemplo',
};

/**
 * Máscara de dado sensível antes de GUARDAR um trecho no registro da revisão (os logs originais são
 * apagados em 90 dias, a revisão fica): CPF/CNPJ, e-mail, cartão e qualquer sequência longa de dígitos
 * (chave PIX numérica, conta) e telefone brasileiro. Valor de gasto e datas ficam, porque são o assunto do caso.
 */
export function redactSensitive(text: string): string {
  return (
    text
      .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[e-mail]')
      .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[cpf]')
      .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[cnpj]')
      // Telefone ANTES do cartão: "+55 34 99199-1020" tem 13 dígitos e seria engolido pela regra de sequência longa.
      // Lookarounds de dígito (e não \b) pra casar "(34) ..." e "+55 ..." sem pegar pedaço de número maior.
      .replace(/(?<!\d)(?:\+?55[\s-]?)?\(?\d{2}\)?[\s-]?9?\d{4}[-\s]?\d{4}(?!\d)/g, '[telefone]')
      .replace(/\b(?:\d[ -]?){12,19}\b/g, '[número]')
  );
}

const SNAPSHOT_MAX_CHARS = 1500;

/** Instantâneo do caso pra guardar com o veredito: mascarado e com teto de tamanho. */
export function buildReviewSnapshot(curationCase: Pick<CurationCase, 'toolName' | 'summary' | 'parameters' | 'result' | 'error'>): {
  tool_name: string;
  summary: string;
  parameters: string;
  result: string;
  error: string | null;
} {
  const clip = (value: unknown) => redactSensitive(JSON.stringify(value ?? null)).slice(0, SNAPSHOT_MAX_CHARS);
  return {
    tool_name: curationCase.toolName,
    summary: redactSensitive(curationCase.summary).slice(0, 300),
    parameters: clip(curationCase.parameters),
    result: clip(curationCase.result),
    error: curationCase.error === null ? null : redactSensitive(curationCase.error).slice(0, 300),
  };
}

export interface ReviewInput {
  verdict: string;
  destination: string | null;
  note: string | null;
}

/** Valida o veredito vindo do formulário: destino só existe (e é obrigatório) quando o Tom errou. Devolve a mensagem do problema ou null. */
export function validateReviewInput(input: ReviewInput): string | null {
  if (!(CURATION_VERDICTS as readonly string[]).includes(input.verdict)) return 'veredito inválido';
  if (input.verdict === 'errou') {
    if (input.destination === null || !(CURATION_DESTINATIONS as readonly string[]).includes(input.destination)) return 'diga pra onde o caso vai (prompt, categoria, bug ou exemplo)';
  } else if (input.destination !== null) {
    return 'destino só vale quando o Tom errou';
  }
  if (input.note !== null && input.note.length > 500) return 'nota longa demais (máx. 500 caracteres)';
  return null;
}
