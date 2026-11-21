import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { redactSensitive } from '@zapbuddy/db';
import { ALL_TOOLS } from '../llm/tool-registry.js';
import {
  GOLDEN_AREAS,
  aggregateRuns,
  buildReport,
  casePassed,
  checkArg,
  evaluateCase,
  formatReport,
  normalizeText,
  type ArgMatcher,
  type CaseResult,
  type EvalContext,
  type GoldenCase,
} from './golden-eval.js';
import { GOLDEN_CASES } from './golden-set.js';

const toolByName = new Map(ALL_TOOLS.map((tool) => [tool.name, tool]));

/** Desembrulha .refine()/.transform() até chegar no z.object, pra olhar os campos. */
function shapeOf(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  let current: z.ZodTypeAny = schema;
  while (current instanceof z.ZodEffects) current = current._def.schema;
  if (!(current instanceof z.ZodObject)) throw new Error('schema de tool não é objeto');
  return current.shape;
}

describe('golden set — validação estática (pega divergência entre o conjunto e as tools reais)', () => {
  it('ids únicos, no formato área-NNN, e de uma área conhecida', () => {
    const ids = GOLDEN_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of GOLDEN_CASES) {
      expect(GOLDEN_AREAS).toContain(c.area);
      expect(c.id).toMatch(/^[a-z]{3}-\d{3}$/);
      expect(c.message.trim().length).toBeGreaterThan(0);
    }
  });

  it('toda tool esperada e proibida existe no registro', () => {
    for (const c of GOLDEN_CASES) {
      const expected = c.expect.tool === null ? [] : Array.isArray(c.expect.tool) ? c.expect.tool : [c.expect.tool];
      for (const name of [...expected, ...(c.forbidTools ?? [])]) {
        expect(toolByName.has(name), `${c.id}: tool "${name}" não existe`).toBe(true);
      }
    }
  });

  it('args só aparecem com UMA tool esperada, e cada argumento existe no schema da tool', () => {
    for (const c of GOLDEN_CASES) {
      if (!c.expect.args) continue;
      expect(typeof c.expect.tool, `${c.id}: args exige uma tool só`).toBe('string');
      const shape = shapeOf(toolByName.get(c.expect.tool as string)!.schema);
      for (const key of Object.keys(c.expect.args)) {
        expect(Object.keys(shape), `${c.id}: "${key}" não é argumento de ${c.expect.tool}`).toContain(key);
      }
    }
  });

  it('valores esperados (equals/oneOf) são aceitos pelo schema do argumento — o caso não exige o impossível', () => {
    for (const c of GOLDEN_CASES) {
      if (!c.expect.args) continue;
      const shape = shapeOf(toolByName.get(c.expect.tool as string)!.schema);
      for (const [key, matcher] of Object.entries(c.expect.args)) {
        const options = 'equals' in matcher ? [matcher.equals] : 'oneOf' in matcher ? matcher.oneOf : [];
        for (const option of options) {
          const parsed = shape[key]!.safeParse(option);
          expect(parsed.success, `${c.id}: ${key}=${JSON.stringify(option)} é recusado pelo schema`).toBe(true);
        }
      }
    }
  });

  it('higiene: nenhuma mensagem do conjunto contém dado pessoal (CPF, e-mail, telefone, cartão)', () => {
    for (const c of GOLDEN_CASES) {
      for (const text of [c.message, ...(c.history ?? []).map((turn) => turn.content), ...(c.facts ?? []).map((fact) => fact.fact)]) {
        expect(redactSensitive(text), `${c.id} parece conter dado pessoal`).toBe(text);
      }
    }
  });

  it('ids de fato são uuid (o forget_fact exige uuid)', () => {
    for (const fact of GOLDEN_CASES.flatMap((c) => c.facts ?? [])) expect(z.string().uuid().safeParse(fact.id).success).toBe(true);
  });

  it('cobertura mínima: volume, todas as áreas, conversa sem tool, casos de "listar antes" e de segurança', () => {
    expect(GOLDEN_CASES.length).toBeGreaterThanOrEqual(45);
    for (const area of GOLDEN_AREAS) expect(GOLDEN_CASES.filter((c) => c.area === area).length, `área ${area}`).toBeGreaterThanOrEqual(2);
    expect(GOLDEN_CASES.filter((c) => c.expect.tool === null).length).toBeGreaterThanOrEqual(5);
    expect(GOLDEN_CASES.filter((c) => c.history).length).toBeGreaterThanOrEqual(2);
    // Pedidos que exigem id: a resposta certa é listar, e a tool de escrita fica proibida.
    expect(GOLDEN_CASES.filter((c) => c.expect.tool === 'list_tasks' && c.forbidTools?.length).length).toBeGreaterThanOrEqual(2);
  });
});

const BRT = 'America/Sao_Paulo';
// 2026-11-21 12:00 em Brasília (UTC-3 → 15:00Z)
const NOW = new Date('2026-11-21T15:00:00.000Z');
const ctx: EvalContext = { now: NOW, timezone: BRT };
const check = (value: unknown, matcher: ArgMatcher) => checkArg(value, matcher, ctx);

describe('checkArg', () => {
  it('equals / oneOf comparam valor exato', () => {
    expect(check(3500, { equals: 3500 })).toBeNull();
    expect(check(3501, { equals: 3500 })).toMatch(/esperava 3500/);
    expect(check('lazer', { oneOf: ['lazer', 'outros'] })).toBeNull();
    expect(check('pet', { oneOf: ['lazer', 'outros'] })).toMatch(/esperava um de/);
  });

  it('includes ignora maiúsculas e acentos; includesAny aceita qualquer um', () => {
    expect(check('Ligar pro João', { includes: 'joao' })).toBeNull();
    expect(check('Ligar pro Pedro', { includes: 'joao' })).not.toBeNull();
    expect(check(42, { includes: '42' })).not.toBeNull();
    expect(check('Aniversário da Mãe', { includesAny: ['mae'] })).toBeNull();
  });

  it('arrayIncludes exige cada trecho em algum item e rejeita o que não é lista', () => {
    expect(check(['Leite integral', 'Pão francês'], { arrayIncludes: ['leite', 'pao'] })).toBeNull();
    expect(check(['Leite'], { arrayIncludes: ['leite', 'pao'] })).toMatch(/faltou/);
    expect(check('leite e pão', { arrayIncludes: ['leite'] })).not.toBeNull();
  });

  it('exists / absent / range', () => {
    expect(check('x', { exists: true })).toBeNull();
    expect(check(undefined, { exists: true })).not.toBeNull();
    expect(check(undefined, { absent: true })).toBeNull();
    expect(check('x', { absent: true })).not.toBeNull();
    expect(check(5, { range: [1, 5] })).toBeNull();
    expect(check(6, { range: [1, 5] })).not.toBeNull();
    expect(check('5', { range: [1, 5] })).not.toBeNull();
  });

  it('datetime confere dia relativo e hora NO FUSO da pessoa, não em UTC', () => {
    // amanhã 15h em Brasília = 2026-11-22T18:00Z
    expect(check('2026-11-22T18:00:00.000Z', { datetime: { dayOffset: 1, hour: 15 } })).toBeNull();
    // mesma instante escrita com offset local
    expect(check('2026-11-22T15:00:00-03:00', { datetime: { dayOffset: 1, hour: 15 } })).toBeNull();
    // o modelo mandou "15h" como se fosse UTC → 12h em Brasília: tem que falhar
    expect(check('2026-11-22T15:00:00.000Z', { datetime: { dayOffset: 1, hour: 15 } })).toMatch(/esperava 15:00/);
    // dia errado
    expect(check('2026-11-23T18:00:00.000Z', { datetime: { dayOffset: 1, hour: 15 } })).toMatch(/esperava o dia 2026-11-22/);
    // sem dayOffset só confere a hora
    expect(check('2030-01-01T11:00:00.000Z', { datetime: { hour: 8 } })).toBeNull();
    expect(check('2026-11-22T18:30:00.000Z', { datetime: { dayOffset: 1, hour: 15, minute: 30 } })).toBeNull();
  });

  it('datetime lida com a virada de dia local (22h em Brasília já é o dia seguinte em UTC)', () => {
    const lateNow: EvalContext = { now: new Date('2026-11-22T01:30:00.000Z'), timezone: BRT }; // 22:30 do dia 21 em Brasília
    expect(checkArg('2026-11-22T13:00:00.000Z', { datetime: { dayOffset: 1, hour: 10 } }, lateNow)).toBeNull(); // 10h do dia 22 local
    expect(checkArg('2026-11-21T13:00:00.000Z', { datetime: { dayOffset: 1, hour: 10 } }, lateNow)).not.toBeNull();
  });

  it('datetime rejeita valor que não é data', () => {
    expect(check('amanhã', { datetime: { dayOffset: 1, hour: 9 } })).toMatch(/data\/hora ISO/);
    expect(check(undefined, { datetime: { hour: 9 } })).toMatch(/data\/hora ISO/);
  });

  it('minutesFromNow confere "daqui a N minutos"', () => {
    expect(check(new Date(NOW.getTime() + 20 * 60_000).toISOString(), { minutesFromNow: { min: 15, max: 25 } })).toBeNull();
    expect(check(new Date(NOW.getTime() + 60 * 60_000).toISOString(), { minutesFromNow: { min: 15, max: 25 } })).toMatch(/daqui a 60 min/);
  });
});

function kase(partial: Partial<GoldenCase> & Pick<GoldenCase, 'expect'>): GoldenCase {
  return { id: 'tst-001', area: 'financeiro', message: 'm', ...partial };
}
const call = (name: string, args: Record<string, unknown> = {}) => ({ name, args });
const outcome = (...calls: ReturnType<typeof call>[]) => ({ toolCalls: calls, text: '' });

describe('evaluateCase', () => {
  it('passa quando a primeira tool e os argumentos conferem', () => {
    const result = evaluateCase(kase({ expect: { tool: 'record_transaction', args: { amount_cents: { equals: 3500 } } } }), outcome(call('record_transaction', { amount_cents: 3500 })), ctx);
    expect(result).toMatchObject({ pass: true, failures: [], firstTool: 'record_transaction' });
  });

  it('falha com tool errada, sem tool, e diz o que veio', () => {
    const wrong = evaluateCase(kase({ expect: { tool: 'list_tasks' } }), outcome(call('complete_task')), ctx);
    expect(wrong.pass).toBe(false);
    expect(wrong.failures[0]).toMatch(/esperava list_tasks, mas a primeira tool foi complete_task/);

    const none = evaluateCase(kase({ expect: { tool: 'list_tasks' } }), outcome(), ctx);
    expect(none.failures[0]).toMatch(/não chamou nenhuma tool/);
  });

  it('tool nula = conversa: qualquer tool chamada falha', () => {
    expect(evaluateCase(kase({ expect: { tool: null } }), outcome(), ctx).pass).toBe(true);
    const result = evaluateCase(kase({ expect: { tool: null } }), outcome(call('create_note')), ctx);
    expect(result.pass).toBe(false);
    expect(result.failures[0]).toMatch(/nenhuma tool/);
  });

  it('lista de tools aceita qualquer uma, e não confere args (variam entre alternativas)', () => {
    const c = kase({ expect: { tool: ['create_calendar_event', 'create_task'] } });
    expect(evaluateCase(c, outcome(call('create_task')), ctx).pass).toBe(true);
    expect(evaluateCase(c, outcome(call('create_calendar_event')), ctx).pass).toBe(true);
    expect(evaluateCase(c, outcome(call('record_transaction')), ctx).pass).toBe(false);
  });

  it('forbidTools falha mesmo que a primeira tool esteja certa (ex.: listou e depois apagou direto)', () => {
    const c = kase({ expect: { tool: 'list_tasks' }, forbidTools: ['delete_task'] });
    const result = evaluateCase(c, outcome(call('list_tasks'), call('delete_task')), ctx);
    expect(result.pass).toBe(false);
    expect(result.failures[0]).toMatch(/delete_task, que é proibida/);
  });

  it('acumula uma falha por argumento, com o nome da tool e do argumento', () => {
    const c = kase({ expect: { tool: 'record_transaction', args: { amount_cents: { equals: 3500 }, category: { equals: 'alimentacao' } } } });
    const result = evaluateCase(c, outcome(call('record_transaction', { amount_cents: 350, category: 'pet' })), ctx);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]).toMatch(/^record_transaction\.amount_cents:/);
    expect(result.failures[1]).toMatch(/^record_transaction\.category:/);
  });
});

describe('aggregateRuns / buildReport / formatReport', () => {
  const result = (id: string, pass: boolean, area: GoldenCase['area'] = 'financeiro'): CaseResult => ({ id, area, pass, failures: pass ? [] : [`${id} falhou`], firstTool: null });

  it('passa quando a maioria das execuções passa, e marca o caso que oscila', () => {
    const summaries = aggregateRuns(
      new Map([
        ['a', [result('a', true), result('a', true), result('a', true)]],
        ['b', [result('b', true), result('b', false), result('b', true)]],
        ['c', [result('c', false), result('c', false), result('c', true)]],
        ['d', [result('d', false), result('d', false), result('d', false)]],
      ]),
    );
    const byId = Object.fromEntries(summaries.map((s) => [s.id, s]));
    expect(casePassed(byId.a!)).toBe(true);
    expect(casePassed(byId.b!)).toBe(true);
    expect(byId.b!.flaky).toBe(true);
    expect(casePassed(byId.c!)).toBe(false);
    expect(casePassed(byId.d!)).toBe(false);
    expect(byId.d!.flaky).toBe(false);
  });

  it('empate (1 de 2) não passa: exige maioria', () => {
    const [summary] = aggregateRuns(new Map([['a', [result('a', true), result('a', false)]]]));
    expect(casePassed(summary!)).toBe(false);
  });

  it('relatório: taxa geral, por área, falhas e oscilantes; vazio não divide por zero', () => {
    const summaries = aggregateRuns(
      new Map([
        ['fin-001', [result('fin-001', true, 'financeiro')]],
        ['fin-002', [result('fin-002', false, 'financeiro')]],
        ['tar-001', [result('tar-001', true, 'tarefas')]],
      ]),
    );
    const report = buildReport(summaries);
    expect(report).toMatchObject({ total: 3, passed: 2 });
    expect(report.passRate).toBeCloseTo(2 / 3);
    expect(report.byArea).toEqual([
      { area: 'financeiro', total: 2, passed: 1 },
      { area: 'tarefas', total: 1, passed: 1 },
    ]);
    expect(report.failed.map((f) => f.id)).toEqual(['fin-002']);

    const text = formatReport(report);
    expect(text).toContain('2/3 casos (66.7%)');
    expect(text).toContain('✗ fin-002');
    expect(text).toContain('fin-002 falhou');

    expect(buildReport([]).passRate).toBeNull();
  });

  it('normalizeText tira acento e caixa', () => {
    expect(normalizeText('Pão Mãe AÇÚCAR')).toBe('pao mae acucar');
  });
});
