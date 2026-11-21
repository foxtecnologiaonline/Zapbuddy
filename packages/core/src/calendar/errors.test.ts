import { describe, expect, it } from 'vitest';
import { CalendarApiError, CalendarAuthError, extractProviderMessage, failApiResponse, failTokenResponse, isDeadGrant } from './errors.js';

describe('extractProviderMessage — o corpo cru nunca vai pra mensagem', () => {
  it('extrai o texto legível dos formatos do Google, do Graph e do OAuth', () => {
    expect(extractProviderMessage(JSON.stringify({ error: { code: 403, message: 'Rate Limit Exceeded' } }))).toBe('Rate Limit Exceeded');
    expect(extractProviderMessage(JSON.stringify({ error: { code: 'ErrorItemNotFound', message: 'The specified object was not found in the store.' } }))).toBe(
      'The specified object was not found in the store.',
    );
    expect(extractProviderMessage(JSON.stringify({ error: 'invalid_grant', error_description: 'AADSTS70008: expired' }))).toBe('AADSTS70008: expired');
    expect(extractProviderMessage(JSON.stringify({ error: 'invalid_grant' }))).toBe('invalid_grant');
  });

  it('trunca o que for longo e achata quebras de linha', () => {
    const long = extractProviderMessage(JSON.stringify({ error: { message: 'x'.repeat(500) } }));
    expect(long.length).toBeLessThanOrEqual(161);
    expect(long.endsWith('…')).toBe(true);
    expect(extractProviderMessage('linha 1\n\n  linha 2')).toBe('linha 1 linha 2');
  });

  it('corpo que não é JSON vira texto curto; vazio vira vazio', () => {
    expect(extractProviderMessage('Bad Gateway')).toBe('Bad Gateway');
    expect(extractProviderMessage('')).toBe('');
    expect(extractProviderMessage('<html>' + 'a'.repeat(400) + '</html>').length).toBeLessThanOrEqual(161);
  });
});

describe('isDeadGrant — token que não volta mais', () => {
  it('invalid_grant e interaction_required (400/401) são token morto', () => {
    expect(isDeadGrant(400, '{"error":"invalid_grant"}')).toBe(true);
    expect(isDeadGrant(400, '{"error": "invalid_grant", "error_description": "AADSTS70008"}')).toBe(true);
    expect(isDeadGrant(401, '{"error":"interaction_required"}')).toBe(true);
  });

  it('invalid_client é configuração NOSSA, não da pessoa; erro de servidor é transitório', () => {
    expect(isDeadGrant(401, '{"error":"invalid_client"}')).toBe(false);
    expect(isDeadGrant(500, '{"error":"invalid_grant"}')).toBe(false);
    expect(isDeadGrant(400, '{"error":"invalid_request"}')).toBe(false);
  });
});

describe('failTokenResponse / failApiResponse', () => {
  it('token morto vira CalendarAuthError; outro erro vira CalendarApiError curto, sem o corpo', async () => {
    await expect(failTokenResponse('Google', new Response('{"error":"invalid_grant"}', { status: 400 }))).rejects.toBeInstanceOf(CalendarAuthError);

    const secretBody = JSON.stringify({ error: 'server_error', error_description: 'falhou', trace: 'tok_SECRET_' + 'z'.repeat(300) });
    const error = await failTokenResponse('Microsoft', new Response(secretBody, { status: 503 })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CalendarApiError);
    expect((error as CalendarApiError).status).toBe(503);
    expect((error as Error).message).toContain('falhou');
    expect((error as Error).message).not.toContain('tok_SECRET_');
  });

  it('erro da API de agenda traz a ação, o status e a mensagem curta', async () => {
    const error = await failApiResponse('Outlook: listagem', new Response(JSON.stringify({ error: { message: 'Access is denied' } }), { status: 403 })).catch((e: unknown) => e);
    expect((error as Error).message).toBe('Outlook: listagem falhou (403): Access is denied');
  });
});
