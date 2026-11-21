import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@zapbuddy/db', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { CalendarApiError, CalendarAuthError } from '../errors.js';
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  listGoogleCalendarEvents,
  newGoogleEventId,
  refreshGoogleAccessToken,
} from './google.js';
import {
  createMicrosoftCalendarEvent,
  deleteMicrosoftCalendarEvent,
  listMicrosoftCalendarEvents,
  refreshMicrosoftAccessToken,
} from './microsoft.js';

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const fetchMock = vi.fn();
const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  Object.assign(process.env, {
    GOOGLE_CLIENT_ID: 'gid',
    GOOGLE_CLIENT_SECRET: 'gsecret',
    GOOGLE_REDIRECT_URI: 'https://app/cb',
    MICROSOFT_CLIENT_ID: 'mid',
    MICROSOFT_CLIENT_SECRET: 'msecret',
    MICROSOFT_REDIRECT_URI: 'https://app/mcb',
  });
});
afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

const urlOf = (call: number): string => String(fetchMock.mock.calls[call]![0]);
const initOf = (call: number): RequestInit => fetchMock.mock.calls[call]![1] as RequestInit;
const headersOf = (call: number): Record<string, string> => initOf(call).headers as Record<string, string>;

describe('Outlook — listagem', () => {
  const GRAPH = 'https://graph.microsoft.com/v1.0';

  it('pede $top, $orderby e $select, UTC explícito, e segue @odata.nextLink até acabar (antes só vinha a 1ª página)', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ value: [{ id: 'a', subject: 'A', start: { dateTime: '2026-11-22T13:00:00.0000000' }, end: { dateTime: '2026-11-22T14:00:00.0000000' } }], '@odata.nextLink': `${GRAPH}/me/calendarView?page=2` }))
      .mockResolvedValueOnce(json({ value: [{ id: 'b', subject: 'B', start: { dateTime: '2026-11-22T15:00:00.0000000' }, end: { dateTime: '2026-11-22T16:00:00.0000000' } }] }));

    const events = await listMicrosoftCalendarEvents('tok', 'primary', '2026-11-22T00:00:00.000Z', '2026-11-23T00:00:00.000Z');

    expect(events.map((e) => e.id)).toEqual(['a', 'b']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = new URL(urlOf(0));
    expect(first.searchParams.get('$top')).toBe('100');
    expect(first.searchParams.get('$orderby')).toBe('start/dateTime');
    expect(first.searchParams.get('$select')).toContain('isAllDay');
    expect(headersOf(0)).toMatchObject({ Authorization: 'Bearer tok', Prefer: 'outlook.timezone="UTC"' });
    expect(urlOf(1)).toBe(`${GRAPH}/me/calendarView?page=2`);
    expect(events[0]!.startIso).toBe('2026-11-22T13:00:00.0000000Z'); // sufixo Z colocado (UTC sem Z não pode virar hora local)
  });

  it('NÃO segue nextLink de outro host: o token nunca é enviado fora do Graph', async () => {
    fetchMock.mockResolvedValueOnce(json({ value: [], '@odata.nextLink': 'https://evil.example.com/steal?x=1' }));
    await listMicrosoftCalendarEvents('tok', 'primary', 'a', 'b');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('para no teto de páginas mesmo se o provedor repetir o link (sem laço infinito)', async () => {
    fetchMock.mockImplementation(async () => json({ value: [], '@odata.nextLink': `${GRAPH}/me/calendarView?loop=1` }));
    await listMicrosoftCalendarEvents('tok', 'primary', 'a', 'b');
    expect(fetchMock.mock.calls.length).toBe(10);
  });

  it('descarta cancelado; livre e recusado ficam, mas com busy:false', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        value: [
          { id: 'c', subject: 'Cancelada', isCancelled: true, start: { dateTime: '2026-11-22T13:00:00' } },
          { id: 'l', subject: 'Livre', showAs: 'free', start: { dateTime: '2026-11-22T14:00:00' } },
          { id: 'r', subject: 'Recusada', responseStatus: { response: 'declined' }, start: { dateTime: '2026-11-22T15:00:00' } },
          { id: 'o', subject: 'Normal', showAs: 'busy', start: { dateTime: '2026-11-22T16:00:00' } },
        ],
      }),
    );
    const events = await listMicrosoftCalendarEvents('tok', 'primary', 'a', 'b');
    expect(events.map((e) => [e.id, e.busy])).toEqual([
      ['l', false],
      ['r', false],
      ['o', true],
    ]);
  });

  it('dia inteiro vira só a data, em qualquer deslocamento (antes caía em "hoje" e mostrava 21:00)', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        value: [
          { id: 'br', subject: 'Viagem', isAllDay: true, start: { dateTime: '2026-11-21T03:00:00.0000000' }, end: { dateTime: '2026-11-24T03:00:00.0000000' } },
          { id: 'utc', subject: 'Feriado', isAllDay: true, start: { dateTime: '2026-11-21T00:00:00.0000000' }, end: { dateTime: '2026-11-22T00:00:00.0000000' } },
          { id: 'mais2', subject: 'Aniversário', isAllDay: true, start: { dateTime: '2026-11-20T22:00:00.0000000' }, end: { dateTime: '2026-11-21T22:00:00.0000000' } },
        ],
      }),
    );
    const events = await listMicrosoftCalendarEvents('tok', 'primary', 'a', 'b');
    expect(events.map((e) => [e.startIso, e.endIso])).toEqual([
      ['2026-11-21', '2026-11-24'],
      ['2026-11-21', '2026-11-22'],
      ['2026-11-21', '2026-11-22'],
    ]);
    expect(events.every((e) => !e.startIso.includes('T'))).toBe(true);
  });

  it('erro da API vira mensagem curta, sem o corpo cru', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'ErrorAccessDenied', message: 'Access is denied.', innerError: { 'request-id': 'abc-123-secret' } } }, 403));
    const error = await listMicrosoftCalendarEvents('tok', 'primary', 'a', 'b').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CalendarApiError);
    expect((error as Error).message).toBe('Outlook: listagem falhou (403): Access is denied.');
    expect((error as Error).message).not.toContain('abc-123-secret');
  });
});

describe('Outlook — criar, apagar e renovar token', () => {
  it('create manda transactionId (o retry do POST não cria evento duplicado)', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'ev1', webLink: 'https://outlook/ev1' }, 201));
    const created = await createMicrosoftCalendarEvent('tok', 'primary', { summary: 'x', startIso: '2026-11-22T13:00:00.000Z', endIso: '2026-11-22T14:00:00.000Z' });
    expect(created).toEqual({ id: 'ev1', htmlLink: 'https://outlook/ev1' });
    const body = JSON.parse(initOf(0).body as string) as { transactionId: string };
    expect(body.transactionId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('delete: 204 = true, 404 = false (não existia), outro erro lança', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await deleteMicrosoftCalendarEvent('tok', 'primary', 'AAMk=/x+y')).toBe(true);
    expect(urlOf(0)).toContain(encodeURIComponent('AAMk=/x+y')); // id do Outlook precisa de encoding na URL

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await deleteMicrosoftCalendarEvent('tok', 'primary', 'sumiu')).toBe(false);

    fetchMock.mockResolvedValueOnce(json({ error: { message: 'Forbidden' } }, 403));
    await expect(deleteMicrosoftCalendarEvent('tok', 'primary', 'x')).rejects.toBeInstanceOf(CalendarApiError);
  });

  it('renovação devolve o refresh token NOVO (rotação) e invalid_grant vira CalendarAuthError', async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: 'acc', refresh_token: 'refresh-novo', expires_in: 3600 }));
    expect(await refreshMicrosoftAccessToken('refresh-velho')).toMatchObject({ accessToken: 'acc', refreshToken: 'refresh-novo' });

    fetchMock.mockResolvedValueOnce(json({ error: 'invalid_grant', error_description: 'AADSTS70008: The provided authorization code or refresh token has expired' }, 400));
    await expect(refreshMicrosoftAccessToken('morto')).rejects.toBeInstanceOf(CalendarAuthError);
  });
});

describe('Google — listagem', () => {
  it('segue nextPageToken com maxResults=250 e junta as páginas', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ items: [{ id: 'a', summary: 'A', start: { dateTime: '2026-11-22T13:00:00-03:00' }, end: { dateTime: '2026-11-22T14:00:00-03:00' } }], nextPageToken: 'tok2' }))
      .mockResolvedValueOnce(json({ items: [{ id: 'b', summary: 'B', start: { dateTime: '2026-11-22T15:00:00-03:00' }, end: { dateTime: '2026-11-22T16:00:00-03:00' } }] }));

    const events = await listGoogleCalendarEvents('tok', 'primary', 'a', 'b');

    expect(events.map((e) => e.id)).toEqual(['a', 'b']);
    expect(new URL(urlOf(0)).searchParams.get('maxResults')).toBe('250');
    expect(new URL(urlOf(1)).searchParams.get('pageToken')).toBe('tok2');
  });

  it('descarta cancelado; transparente e recusado por mim ficam com busy:false; dia inteiro mantém só a data', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        items: [
          { id: 'c', status: 'cancelled', summary: 'Cancelado', start: { dateTime: '2026-11-22T13:00:00Z' } },
          { id: 't', summary: 'Disponível', transparency: 'transparent', start: { dateTime: '2026-11-22T14:00:00Z' } },
          { id: 'r', summary: 'Recusei', attendees: [{ self: true, responseStatus: 'declined' }, { responseStatus: 'accepted' }], start: { dateTime: '2026-11-22T15:00:00Z' } },
          { id: 'o', summary: 'Outro recusou', attendees: [{ self: false, responseStatus: 'declined' }], start: { dateTime: '2026-11-22T16:00:00Z' } },
          { id: 'd', summary: 'Feriado', start: { date: '2026-11-23' }, end: { date: '2026-11-24' } },
        ],
      }),
    );
    const events = await listGoogleCalendarEvents('tok', 'primary', 'a', 'b');
    expect(events.map((e) => [e.id, e.busy])).toEqual([
      ['t', false],
      ['r', false],
      ['o', true],
      ['d', true],
    ]);
    expect(events.at(-1)).toMatchObject({ startIso: '2026-11-23', endIso: '2026-11-24' });
  });
});

describe('Google — criar, apagar e renovar token', () => {
  it('newGoogleEventId: base32hex de 26 caracteres e único', () => {
    const ids = new Set(Array.from({ length: 200 }, newGoogleEventId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[0-9a-v]{26}$/);
  });

  it('create manda um id próprio; 409 (a tentativa anterior já criou) busca o evento em vez de duplicar', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":{"message":"The requested identifier already exists."}}', { status: 409 })).mockResolvedValueOnce(json({ id: 'jaexiste', htmlLink: 'https://cal/jaexiste' }));

    const created = await createGoogleCalendarEvent('tok', 'primary', { summary: 'x', startIso: '2026-11-22T13:00:00.000Z', endIso: '2026-11-22T14:00:00.000Z' });

    expect(created).toEqual({ id: 'jaexiste', htmlLink: 'https://cal/jaexiste' });
    const sentId = (JSON.parse(initOf(0).body as string) as { id: string }).id;
    expect(sentId).toMatch(/^[0-9a-v]{26}$/);
    expect(urlOf(1)).toContain(`/events/${sentId}`); // buscou exatamente o id que mandou
  });

  it('create sem conflito devolve o evento criado', async () => {
    fetchMock.mockResolvedValueOnce(json({ id: 'novo', htmlLink: 'https://cal/novo' }));
    expect(await createGoogleCalendarEvent('tok', 'primary', { summary: 'x', startIso: 's', endIso: 'e' })).toEqual({ id: 'novo', htmlLink: 'https://cal/novo' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('delete: 204 = true; 404 e 410 = false (não existia); outro erro lança', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await deleteGoogleCalendarEvent('tok', 'primary', 'e1')).toBe(true);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await deleteGoogleCalendarEvent('tok', 'primary', 'e2')).toBe(false);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 410 }));
    expect(await deleteGoogleCalendarEvent('tok', 'primary', 'e3')).toBe(false);
    fetchMock.mockResolvedValueOnce(json({ error: { message: 'Forbidden' } }, 403));
    await expect(deleteGoogleCalendarEvent('tok', 'primary', 'e4')).rejects.toBeInstanceOf(CalendarApiError);
  });

  it('renovação: sem refresh token novo (o Google não rotaciona) e invalid_grant vira CalendarAuthError', async () => {
    fetchMock.mockResolvedValueOnce(json({ access_token: 'acc', expires_in: 3600 }));
    expect((await refreshGoogleAccessToken('r')).refreshToken).toBeUndefined();

    fetchMock.mockResolvedValueOnce(json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400));
    await expect(refreshGoogleAccessToken('revogado')).rejects.toBeInstanceOf(CalendarAuthError);
  });
});
