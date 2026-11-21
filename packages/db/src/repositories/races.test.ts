import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

/** Cliente Supabase de mentira: cada tabela/operação devolve o que o teste programar, e as chamadas ficam registradas. */
const script = vi.hoisted(() => ({
  results: new Map<string, Result[]>(),
  calls: [] as string[],
}));

function next(key: string): Result {
  script.calls.push(key);
  const queue = script.results.get(key) ?? [];
  return queue.shift() ?? { data: null, error: null };
}

function fakeClient() {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const chain = (op: string) => () => {
        builder.__op = op;
        return builder;
      };
      builder.insert = chain('insert');
      builder.select = () => builder;
      builder.delete = chain('delete');
      builder.eq = () => builder;
      builder.single = () => Promise.resolve(next(`${table}.${String(builder.__op ?? 'select')}.single`));
      builder.maybeSingle = () => Promise.resolve(next(`${table}.${String(builder.__op ?? 'select')}.maybe`));
      // `await client.from(t).delete().eq(...)` e `insert(...)` sem single: resolve o resultado da operação
      builder.then = (resolve: (value: Result) => unknown) => resolve(next(`${table}.${String(builder.__op ?? 'select')}`));
      return builder;
    },
  };
}

vi.mock('../client.js', () => ({ getSupabaseClient: () => fakeClient() }));

import { createAccountForUser } from './accounts.js';
import { createUser, getOrCreateUser } from './users.js';

const queue = (key: string, ...results: Result[]) => script.results.set(key, results);
const USER = { id: 'u1', whatsapp_number: '5511999999999' };

beforeEach(() => {
  script.results.clear();
  script.calls.length = 0;
});

describe('createUser — duas mensagens simultâneas de um número novo', () => {
  it('a que perde a corrida (23505) devolve o usuário que a outra criou, em vez de falhar e a mensagem sumir', async () => {
    queue('users.insert.single', { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } });
    queue('users.select.maybe', { data: USER, error: null });

    expect(await createUser('5511999999999')).toEqual(USER);
  });

  it('23505 mas o usuário não aparece na releitura: propaga o erro original (não inventa usuário)', async () => {
    queue('users.insert.single', { data: null, error: { code: '23505', message: 'dup' } });
    queue('users.select.maybe', { data: null, error: null });
    await expect(createUser('5511999999999')).rejects.toMatchObject({ code: '23505' });
  });

  it('outro erro do banco propaga como antes', async () => {
    queue('users.insert.single', { data: null, error: { code: '08006', message: 'conexão caiu' } });
    await expect(createUser('5511999999999')).rejects.toMatchObject({ code: '08006' });
    expect(script.calls).not.toContain('users.select.maybe'); // não relê à toa
  });

  it('criação normal devolve o usuário novo', async () => {
    queue('users.insert.single', { data: USER, error: null });
    expect(await createUser('5511999999999')).toEqual(USER);
  });

  it('getOrCreateUser rejeita número inválido antes de tocar no banco', async () => {
    await expect(getOrCreateUser('abc')).rejects.toThrow();
    expect(script.calls).toEqual([]);
  });
});

describe('createAccountForUser — corrida deixava uma conta órfã', () => {
  it('perdeu a corrida no account_members (23505): apaga a conta que acabou de criar e devolve a da vencedora', async () => {
    queue('accounts.insert.single', { data: { id: 'conta-perdedora' }, error: null });
    queue('account_members.insert', { error: { code: '23505', message: 'duplicate user_id' } });
    queue('accounts.delete', { error: null });
    queue('account_members.select.maybe', { data: { account_id: 'conta-vencedora', role: 'owner' }, error: null });

    expect(await createAccountForUser('u1')).toEqual({ accountId: 'conta-vencedora', role: 'owner' });
    expect(script.calls).toContain('accounts.delete'); // a órfã foi limpa
  });

  it('outro erro no vínculo propaga (e não apaga nada às cegas)', async () => {
    queue('accounts.insert.single', { data: { id: 'c1' }, error: null });
    queue('account_members.insert', { error: { code: '23503', message: 'fk' } });
    await expect(createAccountForUser('u1')).rejects.toMatchObject({ code: '23503' });
    expect(script.calls).not.toContain('accounts.delete');
  });

  it('caminho feliz devolve a conta nova como owner', async () => {
    queue('accounts.insert.single', { data: { id: 'c1' }, error: null });
    queue('account_members.insert', { error: null });
    expect(await createAccountForUser('u1')).toEqual({ accountId: 'c1', role: 'owner' });
  });
});
