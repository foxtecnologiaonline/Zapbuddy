import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  getAccountForUser: vi.fn(),
  createAccountForUser: vi.fn(),
  redeemAccountInvite: vi.fn(),
  findAccountByReferralCode: vi.fn(),
  recordReferral: vi.fn(),
  listRecentCategorizedTransactions: vi.fn(),
  listMemoryFacts: vi.fn(),
  getConversationSummary: vi.fn(),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('@zapbuddy/db', () => db);

const context = vi.hoisted(() => ({ appendTurns: vi.fn(), getRecentTurns: vi.fn() }));
vi.mock('../context/conversation-context.js', () => context);

const llm = vi.hoisted(() => ({ runLlmWithFallback: vi.fn() }));
vi.mock('./providers/orchestration.js', () => llm);

const commands = vi.hoisted(() => ({ executeCommand: vi.fn() }));
vi.mock('../commands/execute.js', () => commands);

const summary = vi.hoisted(() => ({ updateConversationSummaryIfNeeded: vi.fn() }));
vi.mock('../conversation/summary.js', async (importOriginal) => ({ ...(await importOriginal<typeof import('../conversation/summary.js')>()), ...summary }));

vi.mock('../streak/compute.js', () => ({ getCurrentStreakDays: vi.fn().mockResolvedValue(null) }));

import { orchestrateTurn } from './orchestrator.js';

const user = {
  id: 'user-1',
  whatsapp_number: '5511999999999',
  name: 'Ana',
  preferred_name: null,
  occupation: null,
  timezone: 'America/Sao_Paulo',
  onboarding_completed_at: '2026-10-01T00:00:00Z',
  plan_status: 'trial',
  trial_ends_at: '2099-01-01T00:00:00Z',
  created_at: '2026-10-01T00:00:00Z',
  quiet_hours_start: 22,
  quiet_hours_end: 7,
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  db.getAccountForUser.mockResolvedValue({ accountId: 'acc-1', role: 'owner' });
  db.listRecentCategorizedTransactions.mockResolvedValue([]);
  db.listMemoryFacts.mockResolvedValue([]);
  db.getConversationSummary.mockResolvedValue(null);
  context.getRecentTurns.mockResolvedValue([]);
  context.appendTurns.mockResolvedValue(undefined);
  llm.runLlmWithFallback.mockResolvedValue({ replyText: 'Fechou, anotado!' });
  commands.executeCommand.mockResolvedValue(null);
});

describe('comandos diretos', () => {
  it('mensagem inteira que é comando responde sem chamar o LLM', async () => {
    commands.executeCommand.mockResolvedValue('Seu dia hoje está livre.');
    const result = await orchestrateTurn({ user, messageText: 'hoje', messageSource: 'text' });
    expect(result.replyText).toBe('Seu dia hoje está livre.');
    expect(llm.runLlmWithFallback).not.toHaveBeenCalled();
    expect(db.listMemoryFacts).not.toHaveBeenCalled();
    expect(context.appendTurns).toHaveBeenCalledTimes(1);
  });

  it('resposta curta a uma pergunta do Tom NÃO é comando ("amanhã" como resposta a "pra quando?")', async () => {
    context.getRecentTurns.mockResolvedValue([{ role: 'assistant', content: 'Pra quando você quer o lembrete? 🙂', at: '2026-10-29T10:00:00Z' }]);
    const result = await orchestrateTurn({ user, messageText: 'amanhã', messageSource: 'text' });
    expect(commands.executeCommand).not.toHaveBeenCalled();
    expect(llm.runLlmWithFallback).toHaveBeenCalledTimes(1);
    expect(result.replyText).toBe('Fechou, anotado!');
  });

  it('comando que não sabe resolver (null) ou que falha cai no LLM', async () => {
    commands.executeCommand.mockResolvedValueOnce(null);
    await orchestrateTurn({ user, messageText: 'lista de compras', messageSource: 'text' });
    expect(llm.runLlmWithFallback).toHaveBeenCalledTimes(1);

    commands.executeCommand.mockRejectedValueOnce(new Error('db fora'));
    const result = await orchestrateTurn({ user, messageText: 'tarefas', messageSource: 'text' });
    expect(result.replyText).toBe('Fechou, anotado!');
    expect(llm.runLlmWithFallback).toHaveBeenCalledTimes(2);
  });

  it('frase maior que contém a palavra não é comando', async () => {
    await orchestrateTurn({ user, messageText: 'hoje gastei 30 no almoço', messageSource: 'text' });
    expect(commands.executeCommand).not.toHaveBeenCalled();
    expect(llm.runLlmWithFallback).toHaveBeenCalledTimes(1);
  });

  it('quem não terminou o onboarding nunca passa pelo roteador', async () => {
    await orchestrateTurn({ user: { ...(user as object), onboarding_completed_at: null } as never, messageText: 'ajuda', messageSource: 'text' });
    expect(commands.executeCommand).not.toHaveBeenCalled();
  });
});

describe('agradecimento vira reação', () => {
  it('"valeu" sem pergunta pendente reage com ❤️ e não chama o LLM', async () => {
    context.getRecentTurns.mockResolvedValue([{ role: 'assistant', content: 'Anotado!', at: '2026-10-29T10:00:00Z' }]);
    const result = await orchestrateTurn({ user, messageText: 'Valeu!', messageSource: 'text' });
    expect(result.reaction).toBe('❤️');
    expect(result.replyText.length).toBeGreaterThan(0);
    expect(llm.runLlmWithFallback).not.toHaveBeenCalled();
  });

  it('depois de uma pergunta do Tom, "valeu" é resposta e vai pro LLM', async () => {
    context.getRecentTurns.mockResolvedValue([{ role: 'assistant', content: 'Quer que eu remarque pra amanhã?', at: '2026-10-29T10:00:00Z' }]);
    const result = await orchestrateTurn({ user, messageText: 'valeu', messageSource: 'text' });
    expect(result.reaction).toBeUndefined();
    expect(llm.runLlmWithFallback).toHaveBeenCalledTimes(1);
  });

  it('"ok" nunca vira reação', async () => {
    const result = await orchestrateTurn({ user, messageText: 'ok', messageSource: 'text' });
    expect(result.reaction).toBeUndefined();
    expect(llm.runLlmWithFallback).toHaveBeenCalledTimes(1);
  });
});

describe('caminho do LLM', () => {
  it('injeta resumo da conversa e atualiza só depois do envio (afterSend)', async () => {
    db.getConversationSummary.mockResolvedValue({ summary: '- planeja viagem em dezembro', updatedAt: '2026-10-20T00:00:00Z' });
    const result = await orchestrateTurn({ user, messageText: 'e a passagem?', messageSource: 'text' });

    const system = llm.runLlmWithFallback.mock.calls[0]![0].system as { semiStable: string };
    expect(system.semiStable).toContain('planeja viagem em dezembro');
    expect(summary.updateConversationSummaryIfNeeded).not.toHaveBeenCalled();

    await result.afterSend!();
    expect(summary.updateConversationSummaryIfNeeded).toHaveBeenCalledWith('user-1', expect.any(Array), { summary: '- planeja viagem em dezembro', updatedAt: '2026-10-20T00:00:00Z' });
  });

  it('falha ao ler o resumo nunca impede a resposta', async () => {
    db.getConversationSummary.mockRejectedValue(new Error('tabela não existe'));
    const result = await orchestrateTurn({ user, messageText: 'oi', messageSource: 'text' });
    expect(result.replyText).toBe('Fechou, anotado!');
  });

  it('espelha o jeito de escrever só depois de algumas mensagens', async () => {
    context.getRecentTurns.mockResolvedValue([
      { role: 'user', content: 'vc pode anotar isso pra mim', at: '2026-10-29T10:00:00Z' },
      { role: 'assistant', content: 'Anotado', at: '2026-10-29T10:00:01Z' },
      { role: 'user', content: 'blz, valeu pq tava esquecendo', at: '2026-10-29T10:01:00Z' },
      { role: 'assistant', content: 'De nada', at: '2026-10-29T10:01:01Z' },
      { role: 'user', content: 'tb preciso ligar pro joao', at: '2026-10-29T10:02:00Z' },
    ]);
    await orchestrateTurn({ user, messageText: 'e pra amanha vc lembra', messageSource: 'text' });
    const system = llm.runLlmWithFallback.mock.calls[0]![0].system as { volatile: string };
    expect(system.volatile).toContain('Jeito dela de escrever');
  });
});
