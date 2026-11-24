import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const history = vi.hoisted(() => ({ appendTurns: vi.fn() }));
vi.mock('@zapbuddy/db', () => db);
vi.mock('./conversation-context.js', () => history);

import { recordProactiveMessage } from './proactive-history.js';

beforeEach(() => {
  vi.clearAllMocks();
  history.appendTurns.mockResolvedValue(undefined);
});

describe('recordProactiveMessage', () => {
  it('grava como fala do Tom (assistant) no número da pessoa', async () => {
    await recordProactiveMessage('5511999990000', '⏰ Lembrete: ligar pro João');
    expect(history.appendTurns).toHaveBeenCalledWith('5511999990000', [expect.objectContaining({ role: 'assistant', content: '⏰ Lembrete: ligar pro João' })]);
  });

  it('Redis fora/cota estourada: NUNCA lança (a mensagem já foi entregue; o retry do job reenviaria)', async () => {
    history.appendTurns.mockRejectedValue(new Error('max requests limit exceeded'));
    await expect(recordProactiveMessage('5511999990000', 'x')).resolves.toBeUndefined();
    expect(db.logger.warn).toHaveBeenCalledWith('proactive_history_append_failed', expect.objectContaining({ error: 'max requests limit exceeded' }));
  });
});
