import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { Worker } from 'bullmq';
import { getRedis } from '../lib/redis';
import { enqueueMessageProcessing } from './queue';
import { PROCESS_MESSAGE_QUEUE_NAME } from './types';
import { processJob } from './worker';
import type { ProcessMessageJobData } from './types';

const onboardingCalls: unknown[] = [];
const orchestratorCalls: unknown[] = [];

vi.mock('../repositories/clients', () => ({
  findClientById: vi.fn(async (id: string) => {
    if (id === 'missing-client') return null;
    return {
      id,
      whatsappId: '5511999999999',
      name: null,
      status: id === 'active-client' ? 'active' : 'onboarding',
      onboardingStep: id === 'active-client' ? null : 'awaiting_name',
      onboardingCompletedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
  }),
}));

vi.mock('../onboarding/handle-onboarding-message', () => ({
  handleOnboardingMessage: vi.fn(async (client: unknown, message: unknown) => {
    onboardingCalls.push({ client, message });
  }),
}));

vi.mock('../orchestrator/handle-orchestrator-message', () => ({
  handleOrchestratorMessage: vi.fn(async (client: unknown, message: unknown) => {
    orchestratorCalls.push({ client, message });
  }),
}));

// Integração de ponta a ponta contra Redis real: enfileira com a mesma API
// que o webhook usa e processa com um Worker real na mesma fila — valida
// que nome de fila, conexão e serialização do job batem de fato.
describe('fila BullMQ -> worker (Redis real)', () => {
  let worker: Worker<ProcessMessageJobData>;

  beforeAll(() => {
    worker = new Worker<ProcessMessageJobData>(PROCESS_MESSAGE_QUEUE_NAME, processJob, {
      connection: getRedis(),
    });
  });

  afterAll(async () => {
    await worker.close();
  });

  it('job enfileirado é processado e despachado pro onboarding (cliente em onboarding)', async () => {
    await enqueueMessageProcessing({
      clientId: 'onboarding-client',
      message: { from: '5511999999999', type: 'text', text: 'Carlos', messageId: 'wamid.int1' },
    });

    await vi.waitFor(
      () => {
        expect(onboardingCalls).toHaveLength(1);
      },
      { timeout: 5000 },
    );

    const call = onboardingCalls[0] as { client: { id: string }; message: { messageId: string } };
    expect(call.client.id).toBe('onboarding-client');
    expect(call.message.messageId).toBe('wamid.int1');
  });

  it('cliente ativo vai pro orquestrador, não pro onboarding', async () => {
    await enqueueMessageProcessing({
      clientId: 'active-client',
      message: { from: '5511999999999', type: 'text', text: 'oi', messageId: 'wamid.int2' },
    });

    await vi.waitFor(
      () => {
        expect(orchestratorCalls).toHaveLength(1);
      },
      { timeout: 5000 },
    );
  });

  it('cliente inexistente não quebra o worker (apenas ignora)', async () => {
    await enqueueMessageProcessing({
      clientId: 'missing-client',
      message: { from: '5511999999999', type: 'text', text: 'oi', messageId: 'wamid.int3' },
    });

    // Dá tempo do job processar; nem onboarding nem orquestrador devem ser chamados.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(onboardingCalls).toHaveLength(1);
    expect(orchestratorCalls).toHaveLength(1);
  });
});
