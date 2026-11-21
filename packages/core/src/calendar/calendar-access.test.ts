import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';

const db = vi.hoisted(() => ({
  getCalendarConnection: vi.fn(),
  rotateCalendarRefreshToken: vi.fn(),
  deleteCalendarConnection: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const google = vi.hoisted(() => ({
  refreshGoogleAccessToken: vi.fn(),
  createGoogleCalendarEvent: vi.fn(),
  listGoogleCalendarEvents: vi.fn(),
  deleteGoogleCalendarEvent: vi.fn(),
  updateGoogleCalendarEvent: vi.fn(),
}));
const microsoft = vi.hoisted(() => ({
  refreshMicrosoftAccessToken: vi.fn(),
  createMicrosoftCalendarEvent: vi.fn(),
  listMicrosoftCalendarEvents: vi.fn(),
  deleteMicrosoftCalendarEvent: vi.fn(),
  updateMicrosoftCalendarEvent: vi.fn(),
}));

vi.mock('@zapbuddy/db', () => db);
vi.mock('./providers/google.js', () => google);
vi.mock('./providers/microsoft.js', () => microsoft);

import { decryptSecret, encryptSecret } from '../security/crypto.js';
import { CalendarApiError, CalendarAuthError } from './errors.js';
import { deleteCalendarEvent, getFreshCalendarAccess, listCalendarEvents } from './calendar-access.js';

process.env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');

function connection(provider: 'google' | 'microsoft', refreshToken: string) {
  return { account_id: 'acc-1', provider, calendar_id: 'primary', refresh_token_encrypted: encryptSecret(refreshToken) };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.rotateCalendarRefreshToken.mockResolvedValue(true);
  db.deleteCalendarConnection.mockResolvedValue(undefined);
});

describe('getFreshCalendarAccess — token do Outlook rotaciona e o novo precisa ser gravado', () => {
  it('sem conexão: null, sem chamar provedor', async () => {
    db.getCalendarConnection.mockResolvedValue(null);
    expect(await getFreshCalendarAccess('acc-1')).toBeNull();
    expect(microsoft.refreshMicrosoftAccessToken).not.toHaveBeenCalled();
  });

  it('Outlook devolveu refresh token novo: grava o novo (cifrado), condicionado ao antigo', async () => {
    const stored = connection('microsoft', 'refresh-velho');
    db.getCalendarConnection.mockResolvedValue(stored);
    microsoft.refreshMicrosoftAccessToken.mockResolvedValue({ accessToken: 'acc', refreshToken: 'refresh-novo', expiresInSeconds: 3600 });

    const access = await getFreshCalendarAccess('acc-1');

    expect(access).toEqual({ accessToken: 'acc', calendarId: 'primary', provider: 'microsoft' });
    expect(microsoft.refreshMicrosoftAccessToken).toHaveBeenCalledWith('refresh-velho'); // usou o token em claro, decifrado
    expect(db.rotateCalendarRefreshToken).toHaveBeenCalledTimes(1);
    const [accountId, previous, next] = db.rotateCalendarRefreshToken.mock.calls[0] as [string, string, string];
    expect(accountId).toBe('acc-1');
    expect(previous).toBe(stored.refresh_token_encrypted); // condição: só troca se ninguém trocou antes (corrida)
    expect(next).not.toContain('refresh-novo'); // nunca em claro no banco
    expect(decryptSecret(next)).toBe('refresh-novo');
  });

  it('mesmo token de volta, ou nenhum (Google não rotaciona): não grava nada', async () => {
    db.getCalendarConnection.mockResolvedValue(connection('microsoft', 'igual'));
    microsoft.refreshMicrosoftAccessToken.mockResolvedValue({ accessToken: 'a', refreshToken: 'igual', expiresInSeconds: 1 });
    await getFreshCalendarAccess('acc-1');

    db.getCalendarConnection.mockResolvedValue(connection('google', 'g-refresh'));
    google.refreshGoogleAccessToken.mockResolvedValue({ accessToken: 'g', expiresInSeconds: 1 });
    expect(await getFreshCalendarAccess('acc-1')).toMatchObject({ provider: 'google', accessToken: 'g' });

    expect(db.rotateCalendarRefreshToken).not.toHaveBeenCalled();
  });

  it('falhar ao gravar o token novo não derruba a chamada de agenda em curso (e fica no log)', async () => {
    db.getCalendarConnection.mockResolvedValue(connection('microsoft', 'velho'));
    microsoft.refreshMicrosoftAccessToken.mockResolvedValue({ accessToken: 'acc', refreshToken: 'novo', expiresInSeconds: 1 });
    db.rotateCalendarRefreshToken.mockRejectedValue(new Error('supabase fora'));

    expect(await getFreshCalendarAccess('acc-1')).toMatchObject({ accessToken: 'acc' });
    expect(db.logger.error).toHaveBeenCalledWith('calendar_token_rotation_failed', expect.objectContaining({ accountId: 'acc-1', provider: 'microsoft' }));
  });
});

describe('getFreshCalendarAccess — token revogado ou expirado', () => {
  it('CalendarAuthError remove a conexão morta, registra e devolve null (a agenda passa a contar como não conectada)', async () => {
    db.getCalendarConnection.mockResolvedValue(connection('google', 'revogado'));
    google.refreshGoogleAccessToken.mockRejectedValue(new CalendarAuthError('o Google'));

    expect(await getFreshCalendarAccess('acc-1')).toBeNull();
    expect(db.deleteCalendarConnection).toHaveBeenCalledWith('acc-1');
    expect(db.logger.warn).toHaveBeenCalledWith('calendar_connection_revoked', { accountId: 'acc-1', provider: 'google' });
  });

  it('falha ao remover a conexão não vira erro pra quem chamou (continua null)', async () => {
    db.getCalendarConnection.mockResolvedValue(connection('microsoft', 'expirado'));
    microsoft.refreshMicrosoftAccessToken.mockRejectedValue(new CalendarAuthError('a Microsoft'));
    db.deleteCalendarConnection.mockRejectedValue(new Error('banco fora'));

    expect(await getFreshCalendarAccess('acc-1')).toBeNull();
    expect(db.logger.error).toHaveBeenCalledWith('calendar_connection_delete_failed', expect.objectContaining({ accountId: 'acc-1' }));
  });

  it('erro TRANSITÓRIO (provedor fora do ar) propaga e NÃO apaga a conexão: não se perde a agenda por um soluço', async () => {
    db.getCalendarConnection.mockResolvedValue(connection('google', 'bom'));
    google.refreshGoogleAccessToken.mockRejectedValue(new CalendarApiError('Google: pedido de token falhou (503): indisponível', 503));

    await expect(getFreshCalendarAccess('acc-1')).rejects.toBeInstanceOf(CalendarApiError);
    expect(db.deleteCalendarConnection).not.toHaveBeenCalled();
  });
});

describe('listCalendarEvents / deleteCalendarEvent', () => {
  it('despacha pro provedor certo e devolve a lista ordenada por início (dia inteiro, só a data, vem antes)', async () => {
    microsoft.listMicrosoftCalendarEvents.mockResolvedValue([
      { id: 'tarde', summary: 'Tarde', startIso: '2026-11-22T18:00:00.000Z', endIso: '' },
      { id: 'dia', summary: 'Dia todo', startIso: '2026-11-22', endIso: '2026-11-23' },
      { id: 'cedo', summary: 'Cedo', startIso: '2026-11-22T11:00:00.000Z', endIso: '' },
    ]);
    const events = await listCalendarEvents({ accessToken: 't', calendarId: 'primary', provider: 'microsoft' }, 'a', 'b');
    expect(events.map((e) => e.id)).toEqual(['dia', 'cedo', 'tarde']);
    expect(google.listGoogleCalendarEvents).not.toHaveBeenCalled();
  });

  it('delete repassa se o evento existia (false = já não existia)', async () => {
    google.deleteGoogleCalendarEvent.mockResolvedValue(false);
    expect(await deleteCalendarEvent({ accessToken: 't', calendarId: 'primary', provider: 'google' }, 'e')).toBe(false);
    microsoft.deleteMicrosoftCalendarEvent.mockResolvedValue(true);
    expect(await deleteCalendarEvent({ accessToken: 't', calendarId: 'primary', provider: 'microsoft' }, 'e')).toBe(true);
  });
});
