import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from '../types/client';
import { handleOnboardingMessage } from './handle-onboarding-message';

const sentMessages: { to: string; body: string }[] = [];
const repoCalls: { fn: string; clientId: string; value?: string }[] = [];

vi.mock('../whatsapp/send-message', () => ({
  sendWhatsAppTextMessage: vi.fn(async (to: string, body: string) => {
    sentMessages.push({ to, body });
  }),
  sendWhatsAppTextMessages: vi.fn(async (to: string, bodies: string[]) => {
    bodies.forEach((body) => sentMessages.push({ to, body }));
  }),
}));

vi.mock('../repositories/clients', () => ({
  setOnboardingStep: vi.fn(async (clientId: string, step: string) => {
    repoCalls.push({ fn: 'setOnboardingStep', clientId, value: step });
  }),
  markOnboardingComplete: vi.fn(async (clientId: string, name: string) => {
    repoCalls.push({ fn: 'markOnboardingComplete', clientId, value: name });
  }),
}));

function makeClient(overrides: Partial<Client>): Client {
  return {
    id: 'c1',
    whatsappId: '5511999999999',
    name: null,
    status: 'onboarding',
    onboardingStep: 'new',
    onboardingCompletedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('handleOnboardingMessage', () => {
  beforeEach(() => {
    sentMessages.length = 0;
    repoCalls.length = 0;
  });

  it('primeiro contato (mesmo por áudio) envia as boas-vindas e avança a etapa', async () => {
    const client = makeClient({ onboardingStep: 'new' });
    await handleOnboardingMessage(client, { from: client.whatsappId, type: 'audio', text: null, messageId: 'm1' });

    expect(sentMessages).toHaveLength(2);
    expect(repoCalls).toContainEqual({ fn: 'setOnboardingStep', clientId: 'c1', value: 'awaiting_name' });
  });

  it('resposta vazia/não-texto na etapa awaiting_name não completa o onboarding', async () => {
    const client = makeClient({ onboardingStep: 'awaiting_name' });
    await handleOnboardingMessage(client, { from: client.whatsappId, type: 'audio', text: null, messageId: 'm2' });

    expect(repoCalls.some((c) => c.fn === 'markOnboardingComplete')).toBe(false);
    expect(sentMessages[0].body).toContain('nome');
  });

  it('nome em texto completa o onboarding com o nome trimado', async () => {
    const client = makeClient({ onboardingStep: 'awaiting_name' });
    await handleOnboardingMessage(client, { from: client.whatsappId, type: 'text', text: '  Carlos  ', messageId: 'm3' });

    expect(repoCalls).toContainEqual({ fn: 'markOnboardingComplete', clientId: 'c1', value: 'Carlos' });
    expect(sentMessages[0].body).toContain('Carlos');
  });
});
