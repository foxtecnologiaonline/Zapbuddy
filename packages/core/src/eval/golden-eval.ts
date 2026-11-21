/**
 * Golden set (docs/adr/0011, camada 2C): casos SINTÉTICOS "mensagem → o que o Tom deve fazer", avaliados sem
 * chamar nenhuma tool de verdade. Este módulo é a parte pura (tipos, matchers, avaliação, relatório) — testável
 * sem rede e sem API key. O runner que fala com o modelo real fica em `scripts/golden-eval.ts`.
 *
 * O que se mede é a ESCOLHA do Tom: qual tool ele chama primeiro e com quais argumentos. É o que a curadoria
 * (fila `/admin/curadoria`) mostra que quebra — categoria fora da taxonomia, hora errada, tool errada — e o que
 * uma mudança de prompt pode piorar sem ninguém perceber. Texto da resposta não é avaliado aqui (isso é do
 * `persona-eval`, qualitativo).
 */

export type ArgMatcher =
  | { equals: unknown }
  | { oneOf: unknown[] }
  /** Substring, ignorando maiúsculas e acentos. */
  | { includes: string }
  | { includesAny: string[] }
  /** Lista de strings em que cada trecho aparece em algum item (ignora maiúsculas e acentos). */
  | { arrayIncludes: string[] }
  | { exists: true }
  | { absent: true }
  /** Número dentro do intervalo, inclusive. */
  | { range: [number, number] }
  /** Data/hora ISO que, no fuso da pessoa, cai no dia (relativo a hoje) e hora indicados. Sem `dayOffset`, só confere a hora. */
  | { datetime: { dayOffset?: number; hour: number; minute?: number } }
  /** Data/hora ISO daqui a N minutos (para "daqui a 20 minutos"). */
  | { minutesFromNow: { min: number; max: number } };

export const GOLDEN_AREAS = [
  'financeiro',
  'tarefas',
  'lembretes',
  'notas',
  'agenda',
  'datas',
  'habitos',
  'listas',
  'contas',
  'memoria',
  'pesquisa',
  'conversa',
  'seguranca',
] as const;
export type GoldenArea = (typeof GOLDEN_AREAS)[number];

export interface GoldenCase {
  /** Estável: é a chave do relatório e do histórico ("fin-001"). */
  id: string;
  area: GoldenArea;
  /** Mensagem SINTÉTICA. Nunca copie texto real de uma pessoa (ADR 0011): reescreva o caso. */
  message: string;
  /** Turnos anteriores, quando a mensagem só faz sentido com contexto ("amanhã às 10h" respondendo "pra quando?"). */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Fatos que o Tom já sabe sobre a pessoa (entram no prompt com id, como em produção). */
  facts?: Array<{ id: string; fact: string }>;
  expect: {
    /** Primeira tool esperada. Lista = qualquer uma serve. `null` = nenhuma tool (conversa). */
    tool: string | string[] | null;
    /** Só vale com UMA tool esperada: os argumentos variam entre alternativas. */
    args?: Record<string, ArgMatcher>;
  };
  /** Tools que NÃO podem ser chamadas em nenhum momento do turno. */
  forbidTools?: string[];
  /** Por que o caso existe / o que a política do produto diz (ajuda quem for revisar uma falha). */
  note?: string;
}

export interface ModelOutcome {
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  text: string;
}

export interface EvalContext {
  now: Date;
  timezone: string;
}

export interface CaseResult {
  id: string;
  area: GoldenArea;
  pass: boolean;
  failures: string[];
  firstTool: string | null;
}

/** Minúsculas e sem acento: "pão" casa com "Pao", "Mãe" com "mae". */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)!.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** Dia local de hoje + N dias, somando em UTC pra não sofrer com virada de horário de verão. */
function addDays(base: LocalParts, days: number): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(base.year, base.month - 1, base.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function describe(value: unknown): string {
  return value === undefined ? 'ausente' : JSON.stringify(value);
}

/** null = confere; senão, o motivo da falha. */
export function checkArg(value: unknown, matcher: ArgMatcher, context: EvalContext): string | null {
  if ('equals' in matcher) return sameJson(value, matcher.equals) ? null : `esperava ${describe(matcher.equals)}, veio ${describe(value)}`;
  if ('oneOf' in matcher) return matcher.oneOf.some((option) => sameJson(value, option)) ? null : `esperava um de ${describe(matcher.oneOf)}, veio ${describe(value)}`;
  if ('includes' in matcher) {
    return typeof value === 'string' && normalizeText(value).includes(normalizeText(matcher.includes)) ? null : `esperava conter "${matcher.includes}", veio ${describe(value)}`;
  }
  if ('includesAny' in matcher) {
    const ok = typeof value === 'string' && matcher.includesAny.some((part) => normalizeText(value).includes(normalizeText(part)));
    return ok ? null : `esperava conter algum de ${describe(matcher.includesAny)}, veio ${describe(value)}`;
  }
  if ('arrayIncludes' in matcher) {
    const items = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map(normalizeText) : [];
    const missing = matcher.arrayIncludes.filter((part) => !items.some((item) => item.includes(normalizeText(part))));
    return Array.isArray(value) && missing.length === 0 ? null : `faltou ${describe(missing.length ? missing : matcher.arrayIncludes)} na lista, veio ${describe(value)}`;
  }
  if ('exists' in matcher) return value === undefined || value === null ? 'esperava o argumento presente, veio ausente' : null;
  if ('absent' in matcher) return value === undefined || value === null ? null : `esperava ausente, veio ${describe(value)}`;
  if ('range' in matcher) {
    const [min, max] = matcher.range;
    return typeof value === 'number' && value >= min && value <= max ? null : `esperava entre ${min} e ${max}, veio ${describe(value)}`;
  }
  if ('datetime' in matcher) {
    const date = parseDate(value);
    if (!date) return `esperava data/hora ISO, veio ${describe(value)}`;
    const got = localParts(date, context.timezone);
    const { dayOffset, hour, minute = 0 } = matcher.datetime;
    if (dayOffset !== undefined) {
      const want = addDays(localParts(context.now, context.timezone), dayOffset);
      if (got.year !== want.year || got.month !== want.month || got.day !== want.day) {
        return `esperava o dia ${want.year}-${String(want.month).padStart(2, '0')}-${String(want.day).padStart(2, '0')} (hoje ${dayOffset >= 0 ? '+' : ''}${dayOffset}), veio ${describe(value)}`;
      }
    }
    return got.hour === hour && got.minute === minute ? null : `esperava ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} no fuso da pessoa, veio ${describe(value)}`;
  }
  const date = parseDate(value);
  if (!date) return `esperava data/hora ISO, veio ${describe(value)}`;
  const minutes = (date.getTime() - context.now.getTime()) / 60_000;
  const { min, max } = matcher.minutesFromNow;
  return minutes >= min && minutes <= max ? null : `esperava daqui a ${min}–${max} min, veio daqui a ${Math.round(minutes)} min`;
}

/** Avalia um caso contra o que o modelo fez. Pura. */
export function evaluateCase(goldenCase: GoldenCase, outcome: ModelOutcome, context: EvalContext): CaseResult {
  const failures: string[] = [];
  const first = outcome.toolCalls[0];
  const expected = goldenCase.expect.tool;

  if (expected === null) {
    if (first) failures.push(`esperava nenhuma tool (só conversa), mas chamou ${first.name}`);
  } else {
    const allowed = Array.isArray(expected) ? expected : [expected];
    if (!first) {
      failures.push(`esperava ${allowed.join(' ou ')}, mas não chamou nenhuma tool`);
    } else if (!allowed.includes(first.name)) {
      failures.push(`esperava ${allowed.join(' ou ')}, mas a primeira tool foi ${first.name}`);
    } else if (goldenCase.expect.args && allowed.length === 1) {
      for (const [key, matcher] of Object.entries(goldenCase.expect.args)) {
        const problem = checkArg(first.args[key], matcher, context);
        if (problem) failures.push(`${first.name}.${key}: ${problem}`);
      }
    }
  }

  for (const forbidden of goldenCase.forbidTools ?? []) {
    if (outcome.toolCalls.some((call) => call.name === forbidden)) failures.push(`chamou ${forbidden}, que é proibida neste caso`);
  }

  return { id: goldenCase.id, area: goldenCase.area, pass: failures.length === 0, failures, firstTool: first?.name ?? null };
}

export interface CaseSummary {
  id: string;
  area: GoldenArea;
  runs: number;
  passes: number;
  /** Passou em algumas execuções e falhou em outras: o resultado do modelo oscila (temperatura), não é regressão clara. */
  flaky: boolean;
  /** Motivos da última execução que falhou. */
  failures: string[];
}

/** Junta várias execuções do mesmo caso. Passa quando a maioria das execuções passa. */
export function aggregateRuns(resultsByCase: Map<string, CaseResult[]>): CaseSummary[] {
  return [...resultsByCase.entries()].map(([id, results]) => {
    const passes = results.filter((result) => result.pass).length;
    const lastFailure = [...results].reverse().find((result) => !result.pass);
    return {
      id,
      area: results[0]!.area,
      runs: results.length,
      passes,
      flaky: passes > 0 && passes < results.length,
      failures: lastFailure?.failures ?? [],
    };
  });
}

export function casePassed(summary: CaseSummary): boolean {
  return summary.passes * 2 > summary.runs;
}

export interface EvalReport {
  total: number;
  passed: number;
  passRate: number | null;
  byArea: Array<{ area: GoldenArea; total: number; passed: number }>;
  failed: CaseSummary[];
  flaky: CaseSummary[];
}

export function buildReport(summaries: CaseSummary[]): EvalReport {
  const byAreaMap = new Map<GoldenArea, { total: number; passed: number }>();
  for (const summary of summaries) {
    const entry = byAreaMap.get(summary.area) ?? { total: 0, passed: 0 };
    entry.total += 1;
    if (casePassed(summary)) entry.passed += 1;
    byAreaMap.set(summary.area, entry);
  }
  const passed = summaries.filter(casePassed).length;
  return {
    total: summaries.length,
    passed,
    passRate: summaries.length === 0 ? null : passed / summaries.length,
    byArea: [...byAreaMap.entries()].map(([area, value]) => ({ area, ...value })).sort((a, b) => a.area.localeCompare(b.area)),
    failed: summaries.filter((summary) => !casePassed(summary)),
    flaky: summaries.filter((summary) => summary.flaky),
  };
}

export function formatReport(report: EvalReport): string {
  const percent = (value: number | null) => (value === null ? '—' : `${(value * 100).toFixed(1)}%`);
  const lines = [`Golden set: ${report.passed}/${report.total} casos (${percent(report.passRate)})`, '', 'Por área:'];
  for (const area of report.byArea) lines.push(`  ${area.area.padEnd(12)} ${area.passed}/${area.total}`);
  if (report.failed.length > 0) {
    lines.push('', 'Falhas:');
    for (const failed of report.failed) {
      lines.push(`  ✗ ${failed.id} (${failed.passes}/${failed.runs})`);
      for (const failure of failed.failures) lines.push(`      - ${failure}`);
    }
  }
  if (report.flaky.length > 0) {
    lines.push('', `Oscilam entre execuções (${report.flaky.length}): ${report.flaky.map((item) => `${item.id} ${item.passes}/${item.runs}`).join(', ')}`);
  }
  return lines.join('\n');
}
