import { describe, expect, it } from 'vitest';
import { WhatsappWindowClosedError, buildTemplatePayload, parseGraphErrorCode, sanitizeTemplateParam } from './template.js';

describe('sanitizeTemplateParam', () => {
  it('a Meta recusa quebra de linha, tabulação e 4+ espaços no parâmetro: tudo vira um espaço só', () => {
    expect(sanitizeTemplateParam('ligar pro João\n\nno número novo\t(11) 9999-0000    hoje')).toBe('ligar pro João no número novo (11) 9999-0000 hoje');
  });

  it('parâmetro vazio vira "-" (a Meta recusa vazio) e o muito longo é truncado com reticências', () => {
    expect(sanitizeTemplateParam('   \n ')).toBe('-');
    const long = sanitizeTemplateParam('x'.repeat(2000));
    expect(long.length).toBeLessThanOrEqual(900);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('buildTemplatePayload', () => {
  it('monta o POST /messages de um template com parâmetros de corpo, já sanitizados', () => {
    expect(buildTemplatePayload('5511999990000', { name: 'tom_lembrete', language: 'pt_BR', bodyParams: ['ligar\npro João'] })).toEqual({
      messaging_product: 'whatsapp',
      to: '5511999990000',
      type: 'template',
      template: {
        name: 'tom_lembrete',
        language: { code: 'pt_BR' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'ligar pro João' }] }],
      },
    });
  });

  it('template sem variável não manda "components"', () => {
    const payload = buildTemplatePayload('55', { name: 'x', language: 'pt_BR', bodyParams: [] }) as { template: Record<string, unknown> };
    expect('components' in payload.template).toBe(false);
  });
});

describe('parseGraphErrorCode', () => {
  it('lê o código do corpo de erro da Graph API', () => {
    expect(parseGraphErrorCode('{"error":{"message":"(#131047) Re-engagement message","type":"OAuthException","code":131047}}')).toBe(131047);
  });

  it('corpo que não é JSON (ou sem código numérico) devolve null, nunca lança', () => {
    expect(parseGraphErrorCode('<html>502</html>')).toBeNull();
    expect(parseGraphErrorCode('{"error":{"code":"x"}}')).toBeNull();
    expect(parseGraphErrorCode('{}')).toBeNull();
  });

  it('o erro tipado é identificável com instanceof', () => {
    expect(new WhatsappWindowClosedError('x')).toBeInstanceOf(Error);
    expect(new WhatsappWindowClosedError('x')).toBeInstanceOf(WhatsappWindowClosedError);
  });
});
