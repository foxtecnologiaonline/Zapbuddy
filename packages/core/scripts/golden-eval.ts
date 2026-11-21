/**
 * Golden set do Tom (docs/adr/0011): roda os casos sintéticos contra o modelo REAL e mede se ele escolhe a tool e
 * os argumentos certos. Diferente do `persona-eval` (qualitativo, um humano lê), este tem asserts e um limite de
 * aprovação, então serve de gate antes de mudar prompt, modelo ou `effort`.
 *
 * NÃO roda no CI normal (custa chamada real à API): `npm run eval:golden` localmente, ou o workflow manual
 * "Eval do golden set" no GitHub (precisa do secret ANTHROPIC_API_KEY).
 *
 * Variáveis:
 *   ANTHROPIC_API_KEY   obrigatória
 *   ANTHROPIC_MODEL     opcional; o mesmo da produção por padrão
 *   GOLDEN_RUNS         execuções por caso (padrão 1; use 3 pra separar regressão de oscilação do modelo)
 *   GOLDEN_MIN_PASS     taxa mínima de aprovação, 0–1 (padrão 0.85)
 *   GOLDEN_CONCURRENCY  chamadas simultâneas (padrão 4)
 *   GOLDEN_ONLY         só esses casos: ids ou áreas separados por vírgula (ex.: "fin-001,tarefas")
 *
 * Saída: 0 = ok · 1 = abaixo do limite · 2 = erro de API/config (resultado inconclusivo, não é o modelo errando).
 */
import { appendFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { formatReport } from '../src/eval/golden-eval.js';
import { GOLDEN_CASES } from '../src/eval/golden-set.js';
import { createAnthropicCaller, runGoldenSet, type MessagesClient } from '../src/eval/run-golden.js';

function numberFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    console.error(`${name} inválida: "${raw}" (esperado entre ${min} e ${max}).`);
    process.exit(2);
  }
  return value;
}

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY precisa estar definida pra rodar o eval.');
    process.exit(2);
  }

  const runs = Math.round(numberFromEnv('GOLDEN_RUNS', 1, 1, 10));
  const minPass = numberFromEnv('GOLDEN_MIN_PASS', 0.85, 0, 1);
  const concurrency = Math.round(numberFromEnv('GOLDEN_CONCURRENCY', 4, 1, 16));

  const only = (process.env.GOLDEN_ONLY ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const cases = only.length === 0 ? GOLDEN_CASES : GOLDEN_CASES.filter((c) => only.includes(c.id) || only.includes(c.area));
  if (cases.length === 0) {
    console.error(`GOLDEN_ONLY="${only.join(',')}" não casa com nenhum caso.`);
    process.exit(2);
  }

  const model = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5';
  console.log(`Rodando ${cases.length} casos × ${runs} execução(ões) com ${model} (concorrência ${concurrency})…\n`);

  const client = new Anthropic({ apiKey }) as unknown as MessagesClient;
  const { report, apiErrors } = await runGoldenSet({ cases, callModel: createAnthropicCaller(client), runs, concurrency });

  const text = formatReport(report);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Eval do golden set\n\nModelo: \`${model}\` · ${runs} execução(ões) por caso · mínimo ${(minPass * 100).toFixed(0)}%\n\n\`\`\`\n${text}\n\`\`\`\n`);
  }

  if (apiErrors > 0) {
    console.error(`\n${apiErrors} chamada(s) falharam por erro de API/rede: resultado INCONCLUSIVO (não conta como o modelo errando).`);
    process.exit(2);
  }
  if (report.passRate !== null && report.passRate < minPass) {
    console.error(`\nAbaixo do mínimo: ${(report.passRate * 100).toFixed(1)}% < ${(minPass * 100).toFixed(0)}%. Revise cada falha: pode ser o modelo OU o caso.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
