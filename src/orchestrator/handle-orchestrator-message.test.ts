import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from '../types/client';

const sentMessages: { to: string; body: string }[] = [];
let sendShouldThrowCount = 0;

vi.mock('../whatsapp/send-message', () => ({
  sendWhatsAppTextMessage: vi.fn(async (to: string, body: string) => {
    if (sendShouldThrowCount > 0) {
      sendShouldThrowCount -= 1;
      throw new Error('falha de rede no envio');
    }
    sentMessages.push({ to, body });
  }),
}));

let orchestratorShouldThrow = false;

vi.mock('./run-orchestrator', () => ({
  runOrchestrator: vi.fn(async (_clientId: string, text: string) => {
    if (orchestratorShouldThrow) throw new Error('Anthropic API indisponível');
    return `resposta pra: ${text}`;
  }),
}));

import { handleOrchestratorMessage } from './handle-orchestrator-message';

function makeClient(): Client {
  return {
    id: 'c1',
    whatsappId: '5511999999999',
    name: 'Carlos',
    status: 'active',
    onboardingStep: null,
    onboardingCompletedAt: '2026-01-01T00:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('handleOrchestratorMessage', () => {
  beforeEach(() => {
    sentMessages.length = 0;
    orchestratorShouldThrow = false;
    sendShouldThrowCount = 0;
  });

  it('mensagem de texto vai pro orquestrador e a resposta é enviada', async () => {
    const client = makeClient();
    await handleOrchestratorMessage(client, { from: client.whatsappId, type: 'text', text: 'gastei 50', messageId: 'm1' });

    expect(sentMessages).toEqual([{ to: client.whatsappId, body: 'resposta pra: gastei 50' }]);
  });

  it('mensagem não-texto não chama o orquestrador, só avisa a limitação', async () => {
    const client = makeClient();
    await handleOrchestratorMessage(client, { from: client.whatsappId, type: 'audio', text: null, messageId: 'm2' });

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].body).toMatch(/texto/);
  });

  it('erro no orquestrador não propaga (não pode acionar retry do BullMQ) e avisa o cliente', async () => {
    const client = makeClient();
    orchestratorShouldThrow = true;

    await expect(
      handleOrchestratorMessage(client, { from: client.whatsappId, type: 'text', text: 'gastei 50', messageId: 'm3' }),
    ).resolves.toBeUndefined();

    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].body).toMatch(/problema/);
  });

  it('se até o aviso de erro falhar ao enviar, ainda assim não propaga', async () => {
    const client = makeClient();
    orchestratorShouldThrow = true;
    sendShouldThrowCount = 1; // falha só o envio da mensagem de erro

    await expect(
      handleOrchestratorMessage(client, { from: client.whatsappId, type: 'text', text: 'gastei 50', messageId: 'm4' }),
    ).resolves.toBeUndefined();
  });
});
