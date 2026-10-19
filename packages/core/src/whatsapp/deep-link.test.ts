import { describe, expect, it, afterEach } from 'vitest';
import { buildWhatsappDeepLink, buildReferralWhatsappDeepLink, WhatsappNumberNotConfiguredError } from './deep-link.js';

describe('buildWhatsappDeepLink', () => {
  const originalNumber = process.env.TOM_WHATSAPP_NUMBER;

  afterEach(() => {
    if (originalNumber === undefined) delete process.env.TOM_WHATSAPP_NUMBER;
    else process.env.TOM_WHATSAPP_NUMBER = originalNumber;
  });

  it('monta o link com a mensagem padrão "Oi Tom!" quando nenhuma é passada', () => {
    process.env.TOM_WHATSAPP_NUMBER = '5511999999999';

    expect(buildWhatsappDeepLink()).toBe('https://wa.me/5511999999999?text=Oi%20Tom!');
  });

  it('codifica a mensagem customizada pra URL', () => {
    process.env.TOM_WHATSAPP_NUMBER = '5511999999999';

    expect(buildWhatsappDeepLink('Oi Tom, quero começar')).toBe(
      'https://wa.me/5511999999999?text=Oi%20Tom%2C%20quero%20come%C3%A7ar',
    );
  });

  it('lança WhatsappNumberNotConfiguredError sem TOM_WHATSAPP_NUMBER configurado', () => {
    delete process.env.TOM_WHATSAPP_NUMBER;

    expect(() => buildWhatsappDeepLink()).toThrow(WhatsappNumberNotConfiguredError);
  });
});

describe('buildReferralWhatsappDeepLink', () => {
  const originalNumber = process.env.TOM_WHATSAPP_NUMBER;

  afterEach(() => {
    if (originalNumber === undefined) delete process.env.TOM_WHATSAPP_NUMBER;
    else process.env.TOM_WHATSAPP_NUMBER = originalNumber;
  });

  it('monta o link com "Indicado <código>" pré-preenchido', () => {
    process.env.TOM_WHATSAPP_NUMBER = '5511999999999';

    expect(buildReferralWhatsappDeepLink('ABC123')).toBe('https://wa.me/5511999999999?text=Indicado%20ABC123');
  });
});
