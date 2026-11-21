import type Anthropic from '@anthropic-ai/sdk';
import type { MemoryFact, User } from '@zapbuddy/db';
import {
  ANTHROPIC_MAX_TOKENS,
  ANTHROPIC_RESPONSE_EFFORT,
  buildAnthropicRequestParts,
  resolveAnthropicModel,
} from '../llm/providers/anthropic-provider.js';
import { buildSystemPromptBlocks } from '../llm/system-prompt.js';
import {
  aggregateRuns,
  buildReport,
  evaluateCase,
  type CaseResult,
  type CaseSummary,
  type EvalContext,
  type EvalReport,
  type GoldenCase,
  type ModelOutcome,
} from './golden-eval.js';

export const EVAL_TIMEZONE = 'America/Sao_Paulo';

/** Pessoa fictícia que já fez o onboarding, no estado padrão do produto hoje (painel e cobrança desligados). */
export function evalUser(now: Date): User {
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  return {
    id: 'eval-user',
    whatsapp_number: '5511900000000',
    name: 'Marina',
    occupation: null,
    preferred_name: null,
    timezone: EVAL_TIMEZONE,
    onboarding_completed_at: twoWeeksAgo,
    onboarding_variant: 'ask_name_first',
    plan_status: 'active',
    plan_status_updated_at: null,
    plan_intent: null,
    plan_intent_requested_at: null,
    quiet_hours_start: 22,
    quiet_hours_end: 7,
    quiet_hours_confirmed_at: twoWeeksAgo,
    email: null,
    city: null,
    city_uf: null,
    city_latitude: null,
    city_longitude: null,
    morning_digest_enabled: true,
    morning_digest_hour: 8,
    morning_digest_agenda: true,
    morning_digest_finance: true,
    morning_digest_indicators: [],
    indicators_offered_at: null,
    preferred_payment_method: null,
    cpf_cnpj: null,
    asaas_customer_id: null,
    asaas_subscription_id: null,
    asaas_payment_link: null,
    trial_ends_at: twoWeeksAgo,
    created_at: twoWeeksAgo,
  };
}

function toMemoryFacts(facts: NonNullable<GoldenCase['facts']>, now: Date): MemoryFact[] {
  return facts.map((fact) => ({
    id: fact.id,
    account_id: 'eval-account',
    fact: fact.fact,
    created_by_user_id: 'eval-user',
    created_at: now.toISOString(),
  }));
}

/**
 * A requisição EXATA que a produção mandaria pra esse caso: mesmo system em camadas, mesmas tools, mesmo modelo,
 * mesmo effort (tudo vem de `anthropic-provider.ts`, nada copiado). Só o primeiro passo do turno é enviado.
 */
export function buildCaseRequest(goldenCase: GoldenCase, now: Date): Anthropic.MessageCreateParamsNonStreaming {
  const blocks = buildSystemPromptBlocks(evalUser(now), [], null, goldenCase.facts ? toMemoryFacts(goldenCase.facts, now) : []);
  const { tools, system } = buildAnthropicRequestParts(blocks);
  return {
    model: resolveAnthropicModel(),
    max_tokens: ANTHROPIC_MAX_TOKENS,
    output_config: ANTHROPIC_RESPONSE_EFFORT,
    system,
    messages: [...(goldenCase.history ?? []).map((turn) => ({ role: turn.role, content: turn.content })), { role: 'user' as const, content: goldenCase.message }],
    tools,
  };
}

/** O pedaço do cliente da Anthropic que o eval usa — permite um cliente de mentira nos testes. */
export interface MessagesClient {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
}

export type ModelCaller = (goldenCase: GoldenCase, now: Date) => Promise<ModelOutcome>;

export function createAnthropicCaller(client: MessagesClient): ModelCaller {
  return async (goldenCase, now) => {
    const response = await client.messages.create(buildCaseRequest(goldenCase, now));
    return {
      toolCalls: response.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
        .map((block) => ({ name: block.name, args: (block.input ?? {}) as Record<string, unknown> })),
      text: response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n'),
    };
  };
}

export interface RunOptions {
  cases: GoldenCase[];
  callModel: ModelCaller;
  /** Execuções por caso (o modelo oscila: com 3, um caso passa se passar em 2). */
  runs?: number;
  concurrency?: number;
  clock?: () => Date;
}

export interface RunOutcome {
  summaries: CaseSummary[];
  report: EvalReport;
  /** Chamadas que falharam por erro de API/rede. Se > 0 o resultado não é conclusivo (não confundir com o modelo errar). */
  apiErrors: number;
}

/** Roda cada caso `runs` vezes com concorrência limitada. Erro de API em uma chamada não derruba as outras. */
export async function runGoldenSet(options: RunOptions): Promise<RunOutcome> {
  const { cases, callModel, runs = 1, concurrency = 4, clock = () => new Date() } = options;
  const timezone = EVAL_TIMEZONE;
  const jobs = cases.flatMap((goldenCase) => Array.from({ length: runs }, () => goldenCase));
  const resultsByCase = new Map<string, CaseResult[]>(cases.map((goldenCase) => [goldenCase.id, []]));
  let apiErrors = 0;
  let next = 0;

  async function worker(): Promise<void> {
    while (next < jobs.length) {
      const goldenCase = jobs[next]!;
      next += 1;
      // A hora é capturada ANTES da chamada: "amanhã às 15h" é medido contra o instante em que o modelo respondeu.
      const now = clock();
      const context: EvalContext = { now, timezone };
      let result: CaseResult;
      try {
        result = evaluateCase(goldenCase, await callModel(goldenCase, now), context);
      } catch (error) {
        apiErrors += 1;
        result = { id: goldenCase.id, area: goldenCase.area, pass: false, failures: [`erro ao chamar o modelo: ${error instanceof Error ? error.message : String(error)}`], firstTool: null };
      }
      resultsByCase.get(goldenCase.id)!.push(result);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, jobs.length)) }, () => worker()));

  const summaries = aggregateRuns(resultsByCase);
  return { summaries, report: buildReport(summaries), apiErrors };
}
