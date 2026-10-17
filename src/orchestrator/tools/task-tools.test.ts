import { describe, it, expect, vi } from 'vitest';
import { handleCriarTarefa, handleListarTarefas, handleConcluirTarefa } from './task-tools';

vi.mock('../../repositories/tasks', () => ({
  createTask: vi.fn(async (input: { title: string }) => ({ id: 't1', title: input.title })),
  listPendingTasks: vi.fn(async () => [
    { id: 't1', title: 'Pagar fornecedor', dueAt: '2026-10-20T00:00:00Z' },
    { id: 't2', title: 'Ligar pro cliente', dueAt: null },
  ]),
  completeTaskByTitle: vi.fn(async (_clientId: string, title: string) => {
    if (title === 'inexistente') return null;
    return { id: 't1', title: 'Pagar fornecedor' };
  }),
}));

describe('handleCriarTarefa', () => {
  it('cria com título trimado', async () => {
    const result = await handleCriarTarefa({ titulo: '  Comprar material  ' }, { clientId: 'c1' });
    expect(JSON.parse(result)).toEqual({ criada: true, id: 't1', titulo: 'Comprar material' });
  });

  it('rejeita título vazio', async () => {
    const result = await handleCriarTarefa({ titulo: '   ' }, { clientId: 'c1' });
    expect(JSON.parse(result)).toHaveProperty('erro');
  });
});

describe('handleListarTarefas', () => {
  it('lista título e vencimento das tarefas pendentes', async () => {
    const result = await handleListarTarefas({}, { clientId: 'c1' });
    expect(JSON.parse(result)).toEqual({
      tarefas: [
        { titulo: 'Pagar fornecedor', vencimento: '2026-10-20T00:00:00Z' },
        { titulo: 'Ligar pro cliente', vencimento: null },
      ],
    });
  });
});

describe('handleConcluirTarefa', () => {
  it('conclui quando encontra por título aproximado', async () => {
    const result = await handleConcluirTarefa({ titulo: 'fornecedor' }, { clientId: 'c1' });
    expect(JSON.parse(result)).toEqual({ concluida: true, titulo: 'Pagar fornecedor' });
  });

  it('reporta não encontrada sem quebrar', async () => {
    const result = await handleConcluirTarefa({ titulo: 'inexistente' }, { clientId: 'c1' });
    expect(JSON.parse(result)).toEqual({ concluida: false, motivo: 'tarefa não encontrada' });
  });
});
