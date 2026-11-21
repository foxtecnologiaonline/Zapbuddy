import { describe, expect, it } from 'vitest';
import { buildReviewSnapshot, detectCurationCases, redactSensitive, signalRatePer100, SIGNAL_PRIORITY, validateReviewInput } from './curation.js';
import type { ToolCallLog } from './types.js';

const T0 = Date.parse('2026-11-10T12:00:00.000Z');
let seq = 0;

function log(partial: Partial<ToolCallLog> & Pick<ToolCallLog, 'tool_name'>, offsetSeconds = 0): ToolCallLog {
  seq += 1;
  return {
    id: `log-${seq}`,
    user_id: 'u1',
    parameters: {},
    result: { ok: true },
    success: true,
    error: null,
    duration_ms: 10,
    created_at: new Date(T0 + offsetSeconds * 1000).toISOString(),
    ...partial,
  };
}

describe('detectCurationCases', () => {
  it('sem logs: nada a revisar, sem dividir por zero', () => {
    const scan = detectCurationCases([]);
    expect(scan.cases).toEqual([]);
    expect(signalRatePer100(scan)).toBeNull();
  });

  it('chamada comum bem-sucedida não gera caso', () => {
    const scan = detectCurationCases([log({ tool_name: 'create_task' }), log({ tool_name: 'list_tasks' }, 5)]);
    expect(scan.cases).toEqual([]);
    expect(scan.callsTotal).toBe(2);
    expect(signalRatePer100(scan)).toBe(0);
  });

  it('falha de tool vira caso "failed" com a mensagem de erro', () => {
    const { cases } = detectCurationCases([log({ tool_name: 'create_reminder', success: false, error: 'remind_at no passado' })]);
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ signal: 'failed', toolName: 'create_reminder' });
    expect(cases[0]!.summary).toContain('remind_at no passado');
  });

  it('desfazer é o sinal mais forte e diz o que foi desfeito', () => {
    const { cases } = detectCurationCases([log({ tool_name: 'undo_last_action', result: { undone: true, undone_action: 'record_transaction' } })]);
    expect(cases[0]).toMatchObject({ signal: 'undone', priority: SIGNAL_PRIORITY.undone });
    expect(cases[0]!.summary).toContain('record_transaction');
  });

  it('desfazer que não desfez nada (nothing_to_undo) não é sinal', () => {
    const { cases } = detectCurationCases([log({ tool_name: 'undo_last_action', result: { undone: false, reason: 'nothing_to_undo' } })]);
    expect(cases).toEqual([]);
  });

  it('edição até 10 min depois de criar = corrigido; depois disso a pessoa só mudou de ideia', () => {
    const quick = detectCurationCases([log({ tool_name: 'create_task' }, 0), log({ tool_name: 'update_task' }, 90)]);
    expect(quick.cases).toHaveLength(1);
    expect(quick.cases[0]).toMatchObject({ signal: 'corrected', toolName: 'update_task' });
    expect(quick.cases[0]!.summary).toContain('90s depois de create_task');

    const late = detectCurationCases([log({ tool_name: 'create_task' }, 0), log({ tool_name: 'update_task' }, 11 * 60)]);
    expect(late.cases).toEqual([]);
  });

  it('edição sem criação recente, ou de outro usuário, não conta', () => {
    expect(detectCurationCases([log({ tool_name: 'update_note' })]).cases).toEqual([]);
    const otherUser = detectCurationCases([log({ tool_name: 'create_note', user_id: 'u2' }, 0), log({ tool_name: 'update_note', user_id: 'u1' }, 30)]);
    expect(otherUser.cases).toEqual([]);
  });

  it('correct_last_transaction que não achou o que corrigir (corrected:false) não é sinal', () => {
    const { cases } = detectCurationCases([
      log({ tool_name: 'record_transaction' }, 0),
      log({ tool_name: 'correct_last_transaction', result: { corrected: false, reason: 'no_recent_transaction' } }, 20),
    ]);
    expect(cases).toEqual([]);
  });

  it('categoria que caiu em "outros" vira caso e mostra qual categoria o modelo tentou', () => {
    const { cases } = detectCurationCases([
      log({ tool_name: 'record_transaction', parameters: { category: 'pet' }, result: { recorded: true, category: 'outros', category_fallback: true } }),
    ]);
    expect(cases[0]).toMatchObject({ signal: 'category_fallback' });
    expect(cases[0]!.summary).toContain('"pet"');
  });

  it('um log gera no máximo um caso, com o sinal mais forte', () => {
    // correct_last_transaction logo após criar E com categoria desconhecida: vale "corrected" (prioridade 3 < 4).
    const { cases } = detectCurationCases([
      log({ tool_name: 'record_transaction' }, 0),
      log({ tool_name: 'correct_last_transaction', parameters: { category: 'xyz' }, result: { corrected: true, category_fallback: true } }, 30),
    ]);
    expect(cases).toHaveLength(1);
    expect(cases[0]!.signal).toBe('corrected');
  });

  it('ordena por prioridade e, dentro dela, do mais recente pro mais antigo — independente da ordem de entrada', () => {
    const logs = [
      log({ tool_name: 'record_transaction', parameters: { category: 'a' }, result: { category_fallback: true } }, 0),
      log({ tool_name: 'create_task', success: false, error: 'x' }, 10),
      log({ tool_name: 'undo_last_action', result: { undone: true, undone_action: 'create_note' } }, 20),
      log({ tool_name: 'create_task', success: false, error: 'y' }, 30),
    ];
    const order = (input: ToolCallLog[]) => detectCurationCases(input).cases.map((c) => `${c.signal}@${c.at.slice(14, 19)}`);
    const expected = ['undone@00:20', 'failed@00:30', 'failed@00:10', 'category_fallback@00:00'];
    expect(order(logs)).toEqual(expected);
    expect(order([...logs].reverse())).toEqual(expected);
  });

  it('conta por sinal e calcula a taxa por 100 chamadas', () => {
    const logs = [
      ...Array.from({ length: 18 }, (_, i) => log({ tool_name: 'list_tasks' }, i)),
      log({ tool_name: 'create_task', success: false, error: 'e' }, 100),
      log({ tool_name: 'undo_last_action', result: { undone: true, undone_action: 'create_note' } }, 110),
    ];
    const scan = detectCurationCases(logs);
    expect(scan.countsBySignal).toEqual({ undone: 1, failed: 1, corrected: 0, category_fallback: 0 });
    expect(signalRatePer100(scan)).toBe(10); // 2 sinais em 20 chamadas
  });
});

describe('redactSensitive', () => {
  it('mascara CPF, CNPJ, e-mail, cartão e telefone', () => {
    expect(redactSensitive('cpf 123.456.789-09 e 12345678909')).toBe('cpf [cpf] e [cpf]');
    expect(redactSensitive('empresa 12.345.678/0001-95')).toBe('empresa [cnpj]');
    expect(redactSensitive('fala com ana.silva+x@exemplo.com.br')).toBe('fala com [e-mail]');
    expect(redactSensitive('cartão 4111 1111 1111 1111')).toBe('cartão [número]');
    expect(redactSensitive('liga (34) 99199-1020 ou +55 34 99199-1020')).toBe('liga [telefone] ou [telefone]');
  });

  it('mantém o que é o assunto do caso: valor, data e hora', () => {
    const text = 'gastei R$ 80,50 no mercado em 2026-11-21 12:00 e 21/11/2026, parcela 3x de 1250';
    expect(redactSensitive(text)).toBe(text);
  });
});

describe('buildReviewSnapshot', () => {
  it('guarda ferramenta, resumo, parâmetros e resultado já mascarados e com teto de tamanho', () => {
    const snapshot = buildReviewSnapshot({
      toolName: 'record_transaction',
      summary: 'Categoria "pet" não existe',
      parameters: { description: 'ração, cpf 123.456.789-09', amount_cents: 8050 },
      result: { big: 'x'.repeat(5000) },
      error: null,
    });

    expect(snapshot.tool_name).toBe('record_transaction');
    expect(snapshot.parameters).toContain('[cpf]');
    expect(snapshot.parameters).not.toContain('123.456.789-09');
    expect(snapshot.parameters).toContain('8050');
    expect(snapshot.result.length).toBeLessThanOrEqual(1500);
    expect(snapshot.error).toBeNull();
  });
});

describe('validateReviewInput', () => {
  it('"errou" exige destino válido; os outros vereditos não aceitam destino', () => {
    expect(validateReviewInput({ verdict: 'errou', destination: 'prompt', note: null })).toBeNull();
    expect(validateReviewInput({ verdict: 'errou', destination: null, note: null })).toMatch(/pra onde/);
    expect(validateReviewInput({ verdict: 'errou', destination: 'outro', note: null })).toMatch(/pra onde/);
    expect(validateReviewInput({ verdict: 'acertou', destination: null, note: 'sinal enganou' })).toBeNull();
    expect(validateReviewInput({ verdict: 'ruido', destination: 'bug', note: null })).toMatch(/só vale quando o Tom errou/);
  });

  it('recusa veredito desconhecido e nota longa', () => {
    expect(validateReviewInput({ verdict: 'talvez', destination: null, note: null })).toMatch(/inválido/);
    expect(validateReviewInput({ verdict: 'acertou', destination: null, note: 'x'.repeat(501) })).toMatch(/longa demais/);
    expect(validateReviewInput({ verdict: 'acertou', destination: null, note: 'x'.repeat(500) })).toBeNull();
  });
});
