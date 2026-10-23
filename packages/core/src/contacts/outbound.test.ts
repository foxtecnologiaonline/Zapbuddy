import { describe, expect, it } from 'vitest';
import { chooseSendMode, composeOutboundText, describeSendFailure, OPT_OUT_PATTERN, sanitizeTemplateParam } from './outbound.js';

const NOW = new Date('2026-10-23T12:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

describe('composeOutboundText', () => {
  it('identifica quem pediu e que veio de um assistente', () => {
    const text = composeOutboundText('Fernando', ' Bom dia! ');
    expect(text.startsWith('Bom dia!\n\n')).toBe(true);
    expect(text).toContain('Fernando, via Tom (assistente pessoal)');
  });
});

describe('sanitizeTemplateParam', () => {
  it('remove quebra de linha, tab e espaços repetidos, e corta o tamanho', () => {
    expect(sanitizeTemplateParam('Oi\n\nAline\t tudo    bem?')).toBe('Oi Aline tudo bem?');
    expect(sanitizeTemplateParam('x'.repeat(2000))).toHaveLength(900);
  });
});

describe('chooseSendMode', () => {
  it('janela aberta → texto livre', () => {
    expect(chooseSendMode({ lastInboundAtIso: hoursAgo(2), templateConfigured: true, now: NOW })).toBe('free_form');
  });

  it('janela fechada ou nunca falou + template configurado → template', () => {
    expect(chooseSendMode({ lastInboundAtIso: hoursAgo(30), templateConfigured: true, now: NOW })).toBe('template');
    expect(chooseSendMode({ lastInboundAtIso: null, templateConfigured: true, now: NOW })).toBe('template');
  });

  it('sem template configurado tenta texto livre (a Meta decide e o erro é explicado)', () => {
    expect(chooseSendMode({ lastInboundAtIso: null, templateConfigured: false, now: NOW })).toBe('free_form');
  });

  it('com folga de 1h: 23h30 atrás já conta como fechada', () => {
    expect(chooseSendMode({ lastInboundAtIso: hoursAgo(23.5), templateConfigured: true, now: NOW })).toBe('template');
  });
});

describe('describeSendFailure', () => {
  it('traduz os códigos conhecidos da Meta', () => {
    expect(describeSendFailure('WhatsApp send failed (400): {"error":{"code":131047}}')).toBe('outside_24h_window');
    expect(describeSendFailure('... 131026 ...')).toBe('number_not_on_whatsapp');
    expect(describeSendFailure('timeout')).toBe('send_failed');
  });
});

describe('OPT_OUT_PATTERN', () => {
  it.each(['PARAR', 'parar.', ' Sair ', 'stop!', 'Cancelar'])('reconhece %s', (text) => {
    expect(OPT_OUT_PATTERN.test(text)).toBe(true);
  });
  it.each(['não quero parar de falar com você', 'pare de brincadeira, aline', 'bom dia', 'sair hoje?'])('ignora %s', (text) => {
    expect(OPT_OUT_PATTERN.test(text)).toBe(false);
  });
});
