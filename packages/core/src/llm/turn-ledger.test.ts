import { beforeEach, describe, expect, it } from 'vitest';
import { acquireTurnLedger, resetTurnLedgers, TurnLedger } from './turn-ledger.js';

beforeEach(() => {
  resetTurnLedgers();
});

describe('TurnLedger', () => {
  it('na própria tentativa nada é deduplicado: dois gastos iguais pedidos de propósito continuam sendo dois', () => {
    const ledger = new TurnLedger();
    ledger.startAttempt();
    expect(ledger.replay('record_transaction', { amount_cents: 1000 })).toBeNull();
    ledger.record('record_transaction', { amount_cents: 1000 }, '{"id":"t1"}');
    expect(ledger.replay('record_transaction', { amount_cents: 1000 })).toBeNull(); // 2ª chamada igual, mesma tentativa: executa
    ledger.record('record_transaction', { amount_cents: 1000 }, '{"id":"t2"}');
    expect(ledger.size).toBe(2);
  });

  it('nova tentativa (fallback de provider / retry do job): a chamada idêntica devolve o resultado gravado, sem executar', () => {
    const ledger = new TurnLedger();
    ledger.startAttempt();
    ledger.record('record_transaction', { amount_cents: 4500, description: 'almoço' }, '{"id":"t1"}');

    ledger.startAttempt(); // o Claude falhou depois da tool; a OpenAI recomeça
    expect(ledger.replay('record_transaction', { amount_cents: 4500, description: 'almoço' })).toBe('{"id":"t1"}');
  });

  it('o mesmo resultado só é entregue uma vez por tentativa (as duas chamadas gravadas atendem as duas repetidas, nada além)', () => {
    const ledger = new TurnLedger();
    ledger.startAttempt();
    ledger.record('create_task', { title: 'a' }, '{"id":"1"}');
    ledger.record('create_task', { title: 'a' }, '{"id":"2"}');

    ledger.startAttempt();
    expect(ledger.replay('create_task', { title: 'a' })).toBe('{"id":"1"}');
    expect(ledger.replay('create_task', { title: 'a' })).toBe('{"id":"2"}');
    expect(ledger.replay('create_task', { title: 'a' })).toBeNull(); // uma 3ª é nova de verdade
  });

  it('chamada diferente executa normalmente (o outro modelo decidiu outra coisa)', () => {
    const ledger = new TurnLedger();
    ledger.startAttempt();
    ledger.record('create_task', { title: 'a' }, '{"id":"1"}');
    ledger.startAttempt();
    expect(ledger.replay('create_task', { title: 'b' })).toBeNull();
    expect(ledger.replay('create_reminder', { title: 'a' })).toBeNull();
  });

  it('ordem das propriedades dos argumentos não importa (cada modelo serializa de um jeito)', () => {
    const ledger = new TurnLedger();
    ledger.startAttempt();
    ledger.record('create_task', { title: 'a', due_at: '2026-11-22T10:00:00-03:00', nested: { b: 1, a: 2 } }, 'ok');
    ledger.startAttempt();
    expect(ledger.replay('create_task', { nested: { a: 2, b: 1 }, due_at: '2026-11-22T10:00:00-03:00', title: 'a' })).toBe('ok');
  });

  it('não depende da ordem de término (tool calls em paralelo terminam em ordem variável)', () => {
    const ledger = new TurnLedger();
    ledger.startAttempt();
    ledger.record('create_note', { text: 'B' }, 'B'); // B terminou antes de A
    ledger.record('create_note', { text: 'A' }, 'A');
    ledger.startAttempt();
    expect(ledger.replay('create_note', { text: 'A' })).toBe('A');
    expect(ledger.replay('create_note', { text: 'B' })).toBe('B');
  });

  it('resultado enorme não é gravado (executa de novo, como antes)', () => {
    const ledger = new TurnLedger();
    ledger.startAttempt();
    ledger.record('list_notes', {}, 'x'.repeat(20_001));
    expect(ledger.size).toBe(0);
  });
});

describe('acquireTurnLedger', () => {
  it('o mesmo id de mensagem devolve o mesmo registro (é o que liga o retry do job ao que já foi feito)', () => {
    const first = acquireTurnLedger('wamid.1');
    first.record('create_task', { title: 'a' }, 'ok');
    const again = acquireTurnLedger('wamid.1');
    expect(again).toBe(first);
    again.startAttempt();
    expect(again.replay('create_task', { title: 'a' })).toBe('ok');
  });

  it('mensagens diferentes não se misturam', () => {
    acquireTurnLedger('wamid.1').record('create_task', { title: 'a' }, 'ok');
    const other = acquireTurnLedger('wamid.2');
    other.startAttempt();
    expect(other.replay('create_task', { title: 'a' })).toBeNull();
  });

  it('expira depois de 30 min (um retry tardio não reaproveita efeito antigo)', () => {
    const t0 = 1_000_000;
    acquireTurnLedger('wamid.1', t0).record('create_task', { title: 'a' }, 'ok');
    const later = acquireTurnLedger('wamid.1', t0 + 31 * 60 * 1000);
    later.startAttempt();
    expect(later.replay('create_task', { title: 'a' })).toBeNull();
  });

  it('o total é limitado: o mais antigo sai primeiro', () => {
    const first = acquireTurnLedger('turn-0');
    for (let i = 1; i <= 500; i += 1) acquireTurnLedger(`turn-${i}`);
    expect(acquireTurnLedger('turn-0')).not.toBe(first); // foi descartado e recriado
  });
});
