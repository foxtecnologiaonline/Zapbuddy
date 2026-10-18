import { listRecentErrors, listRecentFailedReminders, listRecentFailedToolCallLogs } from '@zapbuddy/db';
import { Badge, EmptyState, Section, TableScroll, formatDateTime } from '../components';

export const dynamic = 'force-dynamic';

const LIST_LIMIT = 50;

interface UnifiedError {
  id: string;
  createdAt: string;
  source: string;
  message: string;
}

export default async function ErrorsPage() {
  const [errorLogs, failedToolCalls, failedReminders] = await Promise.all([
    listRecentErrors(LIST_LIMIT),
    listRecentFailedToolCallLogs(LIST_LIMIT),
    listRecentFailedReminders(LIST_LIMIT),
  ]);

  const unified: UnifiedError[] = [
    ...errorLogs.map((e) => ({ id: e.id, createdAt: e.created_at, source: e.source, message: e.message })),
    ...failedToolCalls.map((t) => ({
      id: t.id,
      createdAt: t.created_at,
      source: `tool_call:${t.tool_name}`,
      message: t.error ?? 'falha sem mensagem',
    })),
    ...failedReminders.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      source: 'reminder',
      message: r.failed_reason ?? 'falha sem mensagem',
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <Section
      title={`Erros recentes (últimos ${LIST_LIMIT} de cada fonte)`}
      action={
        <a href="/api/admin/errors/export" style={{ color: '#9fb0c0', fontSize: 13 }}>
          Exportar CSV →
        </a>
      }
    >
      {unified.length === 0 ? (
        <EmptyState>Nenhum erro registrado.</EmptyState>
      ) : (
        <TableScroll>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', opacity: 0.6 }}>
              <th style={{ padding: '4px 8px' }}>Quando</th>
              <th style={{ padding: '4px 8px' }}>Fonte</th>
              <th style={{ padding: '4px 8px' }}>Mensagem</th>
            </tr>
          </thead>
          <tbody>
            {unified.map((item) => (
              <tr key={`${item.source}-${item.id}`} style={{ borderTop: '1px solid #1f2733' }}>
                <td style={{ padding: '6px 8px', opacity: 0.7, whiteSpace: 'nowrap' }}>{formatDateTime(item.createdAt)}</td>
                <td style={{ padding: '6px 8px' }}>
                  <Badge tone="neutral">{item.source}</Badge>
                </td>
                <td style={{ padding: '6px 8px', color: '#f87171' }}>{item.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableScroll>
      )}
    </Section>
  );
}
