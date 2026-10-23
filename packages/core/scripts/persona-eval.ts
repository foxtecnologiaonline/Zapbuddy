/**
 * Eval manual de persona (ver CLAUDE.md/README: "não cobre integração real
 * com Claude... validado manualmente" — isto é exatamente esse manual,
 * formalizado como script em vez de mensagem solta no WhatsApp de teste).
 *
 * Roda a API real da Anthropic contra um conjunto fixo de mensagens
 * pensadas pra exercitar a personalidade do Tom (tom emocional, variação de
 * confirmação, streak, momento, pergunta sobre o negócio, etc. — ver
 * system-prompt.ts) e imprime a resposta pra um humano julgar. NÃO entra em
 * CI/vitest: custa chamada real à API e o julgamento é qualitativo, não um
 * assert automatizável.
 *
 * Uso: ANTHROPIC_API_KEY=... npm run persona-eval --workspace=@zapbuddy/core
 */
import Anthropic from '@anthropic-ai/sdk';
import type { User, RecentCategorization } from '@zapbuddy/db';
import { buildSystemPrompt } from '../src/llm/system-prompt.js';
import { toAnthropicToolSpecs } from '../src/llm/tool-registry.js';

function baseUser(overrides: Partial<User> = {}): User {
  return {
    id: 'eval-user',
    whatsapp_number: '5511999999999',
    name: 'Marina',
    preferred_name: null,
    timezone: 'America/Sao_Paulo',
    onboarding_completed_at: '2026-01-01T00:00:00.000Z',
    plan_status: 'active',
    plan_status_updated_at: null,
    plan_intent: null,
    plan_intent_requested_at: null,
    trial_ends_at: '2026-01-04T00:00:00.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

interface Scenario {
  label: string;
  user: User;
  recentCategorizations?: RecentCategorization[];
  streakDays?: number | null;
  userMessage: string;
}

const SCENARIOS: Scenario[] = [
  {
    label: 'Confirmação de gasto simples (varia a frase? soa recibo ou fala natural?)',
    user: baseUser(),
    userMessage: 'gastei 35 no almoço',
  },
  {
    label: 'Tom emocional — frustração (reconhece antes de resolver?)',
    user: baseUser(),
    userMessage: 'que droga, não tô dando conta de nada hoje. ainda preciso anotar que gastei 50 de uber',
  },
  {
    label: 'Tom emocional — comemoração (celebra de verdade?)',
    user: baseUser(),
    userMessage: 'consegui! acabei de fechar uma venda de 2000 reais',
  },
  {
    label: 'Streak de constância (menciona de forma genuína, não decorada?)',
    user: baseUser(),
    streakDays: 12,
    userMessage: 'bom dia! gastei 20 no café',
  },
  {
    label: 'Apelido — pedido explícito (chama set_preferred_name?)',
    user: baseUser(),
    userMessage: 'pode me chamar de Mari a partir de agora',
  },
  {
    label: 'Momento de fim de mês (referência de ambiente, nunca forçada)',
    user: baseUser({ created_at: '2026-01-01T00:00:00.000Z' }),
    userMessage: 'me lembra de pagar o aluguel dia 5',
  },
  {
    label: 'Teste quase no fim (último dia dos 3 de trial — avisa sem forçar convite)',
    user: baseUser({ plan_status: 'trial', created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() }),
    userMessage: 'qual foi meu resumo da semana?',
  },
  {
    label: 'Pedido de cancelamento (uma pergunta genuína, aceita sem insistir)',
    user: baseUser(),
    userMessage: 'quero parar de usar o Tom',
  },
];

async function runScenario(client: Anthropic, scenario: Scenario): Promise<void> {
  const system = buildSystemPrompt(scenario.user, scenario.recentCategorizations ?? [], scenario.streakDays ?? null);

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5',
    max_tokens: 512,
    system,
    messages: [{ role: 'user', content: scenario.userMessage }],
    tools: toAnthropicToolSpecs(),
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
  const toolCalls = response.content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
    .map((block) => `${block.name}(${JSON.stringify(block.input)})`);

  console.log(`\n=== ${scenario.label} ===`);
  console.log(`> ${scenario.userMessage}`);
  if (toolCalls.length > 0) console.log(`[tools] ${toolCalls.join(', ')}`);
  console.log(text || '(sem texto — modelo só chamou tool, esperado em alguns cenários)');
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY precisa estar definida pra rodar o eval.');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  for (const scenario of SCENARIOS) {
    await runScenario(client, scenario);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
