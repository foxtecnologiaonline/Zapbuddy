/**
 * Groundwork pra uma eventual decisão de fine-tuning (ver CLAUDE.md,
 * amendamento "Pesquisa autônoma e aprendizado contínuo" — explicitamente
 * NÃO inclui treinar/rodar um modelo de verdade, só prepara dados).
 *
 * Exporta tool_call_logs com sucesso num período em JSONL: um registro por
 * linha, {tool_name, parameters, result, created_at}. Formato deliberadamente
 * genérico (não já no formato de fine-tuning de um provider específico) —
 * qual provider e como estruturar o dataset de treino de verdade é decisão
 * de infra/orçamento separada, de quando essa linha for de fato perseguida.
 *
 * Uso: npm run export:finetune-dataset --workspace=@zapbuddy/db -- \
 *   --from=2026-01-01 --to=2026-10-01 --out=dataset.jsonl
 */
import { writeFile } from 'node:fs/promises';
import { listToolCallLogsInRange } from '../src/repositories/tool-call-logs.js';

interface CliArgs {
  fromIso: string;
  toIso: string;
  outPath: string;
}

function parseArgs(argv: string[]): CliArgs {
  const flags = Object.fromEntries(
    argv
      .filter((arg) => arg.startsWith('--'))
      .map((arg) => {
        const [key, value] = arg.slice(2).split('=');
        return [key, value ?? ''];
      }),
  );

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    fromIso: flags.from ? new Date(flags.from).toISOString() : defaultFrom.toISOString(),
    toIso: flags.to ? new Date(flags.to).toISOString() : now.toISOString(),
    outPath: flags.out ?? 'finetune-dataset.jsonl',
  };
}

async function main(): Promise<void> {
  const { fromIso, toIso, outPath } = parseArgs(process.argv.slice(2));

  const logs = await listToolCallLogsInRange(fromIso, toIso);
  const successfulLogs = logs.filter((log) => log.success);

  const lines = successfulLogs.map((log) =>
    JSON.stringify({
      tool_name: log.tool_name,
      parameters: log.parameters,
      result: log.result,
      created_at: log.created_at,
    }),
  );

  await writeFile(outPath, lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf-8');
  console.log(`Exportado ${lines.length} registro(s) (${fromIso} a ${toIso}) para ${outPath}`);
}

main().catch((error) => {
  console.error('export-finetune-dataset falhou:', error);
  process.exitCode = 1;
});
