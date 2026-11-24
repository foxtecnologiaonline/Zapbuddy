import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const fake = vi.hoisted(() => ({ sendText: vi.fn(), sendTemplate: vi.fn() }));

vi.mock('@zapbuddy/db', () => db);
vi.mock('./cloud-api-channel.js', () => ({
  CloudApiChannel: class {
    provider = 'cloud-api' as const;
    sendText = fake.sendText;
    sendTemplate = fake.sendTemplate;
  },
}));
vi.mock('./evolution-channel.js', () => ({ EvolutionChannel: class {} }));

import { getReminderTemplateConfig, sendWhatsappReminder, sendWhatsappTextMessage } from './channel.js';
import { WhatsappWindowClosedError } from './template.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  fake.sendText.mockResolvedValue(undefined);
  fake.sendTemplate.mockResolvedValue(undefined);
  delete process.env.WHATSAPP_REMINDER_TEMPLATE_NAME;
  delete process.env.WHATSAPP_TEMPLATE_LANGUAGE;
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('sendWhatsappTextMessage — texto longo', () => {
  it('texto curto: uma chamada só, igual a antes', async () => {
    await sendWhatsappTextMessage('55', 'oi');
    expect(fake.sendText).toHaveBeenCalledTimes(1);
    expect(fake.sendText).toHaveBeenCalledWith('55', 'oi');
  });

  it('texto acima do limite da Meta vira várias mensagens em ordem, nenhuma passando de 4.000', async () => {
    const text = Array.from({ length: 30 }, (_, i) => `Item ${i}: ${'x'.repeat(300)}`).join('\n\n');
    await sendWhatsappTextMessage('55', text);

    expect(fake.sendText.mock.calls.length).toBeGreaterThan(1);
    for (const call of fake.sendText.mock.calls) expect((call[1] as string).length).toBeLessThanOrEqual(4000);
    expect(fake.sendText.mock.calls[0]![1]).toContain('Item 0');
    expect(fake.sendText.mock.calls.at(-1)![1]).toContain('Item 29');
  });

  it('falha na PRIMEIRA parte propaga (o retry é seguro: nada foi entregue)', async () => {
    fake.sendText.mockRejectedValueOnce(new Error('meta fora'));
    await expect(sendWhatsappTextMessage('55', 'a'.repeat(9000))).rejects.toThrow('meta fora');
    expect(fake.sendText).toHaveBeenCalledTimes(1);
  });

  it('falha numa parte POSTERIOR só registra e para: propagar faria o retry reenviar a primeira, que a pessoa já recebeu', async () => {
    fake.sendText.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('meta fora'));
    await expect(sendWhatsappTextMessage('55', 'a'.repeat(9000))).resolves.toBeUndefined();
    expect(db.logger.warn).toHaveBeenCalledWith('whatsapp_text_part_failed', expect.objectContaining({ part: 2 }));
  });
});

describe('sendWhatsappReminder — janela de 24h', () => {
  it('dentro da janela: texto livre, sem template', async () => {
    process.env.WHATSAPP_REMINDER_TEMPLATE_NAME = 'tom_lembrete';
    expect(await sendWhatsappReminder('55', '⏰ ligar pro João', 'ligar pro João')).toBe('text');
    expect(fake.sendTemplate).not.toHaveBeenCalled();
  });

  it('janela fechada COM template configurado: manda o template com a mensagem do lembrete como parâmetro', async () => {
    process.env.WHATSAPP_REMINDER_TEMPLATE_NAME = 'tom_lembrete';
    fake.sendText.mockRejectedValue(new WhatsappWindowClosedError('131047'));

    expect(await sendWhatsappReminder('55', '⏰ ligar pro João', 'ligar pro João')).toBe('template');
    expect(fake.sendTemplate).toHaveBeenCalledWith('55', { name: 'tom_lembrete', language: 'pt_BR', bodyParams: ['ligar pro João'] });
    expect(db.logger.info).toHaveBeenCalledWith('reminder_sent_via_template', { template: 'tom_lembrete' });
  });

  it('o idioma do template vem da env (padrão pt_BR)', async () => {
    process.env.WHATSAPP_REMINDER_TEMPLATE_NAME = 'tom_lembrete';
    process.env.WHATSAPP_TEMPLATE_LANGUAGE = 'pt_PT';
    fake.sendText.mockRejectedValue(new WhatsappWindowClosedError('131047'));
    await sendWhatsappReminder('55', 'x', 'y');
    expect(fake.sendTemplate).toHaveBeenCalledWith('55', expect.objectContaining({ language: 'pt_PT' }));
  });

  it('janela fechada SEM template: propaga o erro (como antes) e avisa nos logs o que configurar', async () => {
    fake.sendText.mockRejectedValue(new WhatsappWindowClosedError('131047'));
    await expect(sendWhatsappReminder('55', 'x', 'y')).rejects.toBeInstanceOf(WhatsappWindowClosedError);
    expect(fake.sendTemplate).not.toHaveBeenCalled();
    expect(db.logger.warn).toHaveBeenCalledWith('reminder_window_closed_no_template', expect.objectContaining({ hint: expect.stringContaining('WHATSAPP_REMINDER_TEMPLATE_NAME') }));
  });

  it('qualquer OUTRO erro de envio não vira template (só a janela fechada justifica): propaga', async () => {
    process.env.WHATSAPP_REMINDER_TEMPLATE_NAME = 'tom_lembrete';
    fake.sendText.mockRejectedValue(new Error('número inválido'));
    await expect(sendWhatsappReminder('55', 'x', 'y')).rejects.toThrow('número inválido');
    expect(fake.sendTemplate).not.toHaveBeenCalled();
  });

  it('o próprio template falhando propaga (o retry do job tenta de novo)', async () => {
    process.env.WHATSAPP_REMINDER_TEMPLATE_NAME = 'tom_lembrete';
    fake.sendText.mockRejectedValue(new WhatsappWindowClosedError('131047'));
    fake.sendTemplate.mockRejectedValue(new Error('template não aprovado'));
    await expect(sendWhatsappReminder('55', 'x', 'y')).rejects.toThrow('template não aprovado');
  });
});

describe('getReminderTemplateConfig', () => {
  it('sem a env (ou só espaços) = desligado', () => {
    expect(getReminderTemplateConfig()).toBeNull();
    process.env.WHATSAPP_REMINDER_TEMPLATE_NAME = '   ';
    expect(getReminderTemplateConfig()).toBeNull();
  });

  it('com a env: nome aparado e idioma padrão pt_BR', () => {
    process.env.WHATSAPP_REMINDER_TEMPLATE_NAME = ' tom_lembrete ';
    expect(getReminderTemplateConfig()).toEqual({ name: 'tom_lembrete', language: 'pt_BR' });
  });
});
