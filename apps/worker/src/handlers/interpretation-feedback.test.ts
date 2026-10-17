import { describe, expect, it } from 'vitest';
import type { ToolCallLog } from '@zapbuddy/db';
import { buildInterpretationReport } from './interpretation-feedback.js';

function log(overrides: Partial<ToolCallLog>): ToolCallLog {
  return {
    id: 'log-1',
    user_id: 'user-1',
    tool_name: 'record_transaction',
    parameters: {},
    result: null,
    success: true,
    error: null,
    duration_ms: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildInterpretationReport', () => {
  it('relata "nenhuma falha" quando todas as chamadas tiveram sucesso', () => {
    const report = buildInterpretationReport([log({ success: true }), log({ success: true })]);
    expect(report.summary).toBe('Nenhuma falha de tool call no período.');
  });

  it('agrupa falhas por tool e aponta o erro mais comum', () => {
    const logs = [
      log({ tool_name: 'record_transaction', success: false, error: 'Expected number, received string' }),
      log({ tool_name: 'record_transaction', success: false, error: 'Expected number, received string' }),
      log({ tool_name: 'record_transaction', success: true }),
      log({ tool_name: 'create_task', success: false, error: 'título vazio' }),
    ];

    const report = buildInterpretationReport(logs);

    expect(report.stats.record_transaction).toEqual({
      total: 3,
      failed: 2,
      topErrors: [{ error: 'Expected number, received string', count: 2 }],
    });
    expect(report.summary).toContain('record_transaction: 2/3 chamadas falharam');
    expect(report.summary).toContain('Expected number, received string');
    expect(report.summary).toContain('create_task: 1/1 chamadas falharam');
  });

  it('ordena pelo tool com mais falhas primeiro', () => {
    const logs = [
      log({ tool_name: 'create_task', success: false, error: 'e1' }),
      log({ tool_name: 'record_transaction', success: false, error: 'e2' }),
      log({ tool_name: 'record_transaction', success: false, error: 'e2' }),
    ];

    const report = buildInterpretationReport(logs);
    const lines = report.summary.split('\n');
    expect(lines[0]).toContain('record_transaction');
    expect(lines[1]).toContain('create_task');
  });
});
