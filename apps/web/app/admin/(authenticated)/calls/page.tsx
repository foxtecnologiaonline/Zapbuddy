import { listToolCallLogs, TOOL_CALL_LOGS_PAGE_SIZE } from '@zapbuddy/db';
import { Badge, EmptyState, Pagination, Section, formatDateTime } from '../components';

export const dynamic = 'force-dynamic';

interface CallsPageProps {
  searchParams: Promise<{ page?: string; success?: string }>;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export default async function CallsPage({ searchParams }: CallsPageProps) {
  const { page: pageParam, success } = await searchParams;
  const page = Math.max(0, Number(pageParam) || 0);
  const successFilter = success === 'true' ? true : success === 'false' ? false : undefined;

  const { logs, total } = await listToolCallLogs(page, successFilter);
  const hasNext = (page + 1) * TOOL_CALL_LOGS_PAGE_SIZE < total;

  return (
    <Section title={`Chamadas da IA (${total})`}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, fontSize: 13 }}>
        <a href="/admin/calls" style={{ color: successFilter === undefined ? '#e6edf3' : '#9fb0c0' }}>
          Todas
        </a>
        <a href="/admin/calls?success=true" style={{ color: successFilter === true ? '#e6edf3' : '#9fb0c0' }}>
          Sucesso
        </a>
        <a href="/admin/calls?success=false" style={{ color: successFilter === false ? '#e6edf3' : '#9fb0c0' }}>
          Falha
        </a>
      </div>

      {logs.length === 0 ? (
        <EmptyState>Nenhuma chamada registrada.</EmptyState>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', opacity: 0.6 }}>
              <th style={{ padding: '4px 8px' }}>Quando</th>
              <th style={{ padding: '4px 8px' }}>Tool</th>
              <th style={{ padding: '4px 8px' }}>Status</th>
              <th style={{ padding: '4px 8px' }}>Parâmetros</th>
              <th style={{ padding: '4px 8px' }}>Erro</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} style={{ borderTop: '1px solid #1f2733' }}>
                <td style={{ padding: '6px 8px', opacity: 0.7, whiteSpace: 'nowrap' }}>{formatDateTime(log.created_at)}</td>
                <td style={{ padding: '6px 8px' }}>{log.tool_name}</td>
                <td style={{ padding: '6px 8px' }}>
                  {log.success ? <Badge tone="ok">ok</Badge> : <Badge tone="bad">falhou</Badge>}
                </td>
                <td style={{ padding: '6px 8px', opacity: 0.7, fontFamily: 'monospace', fontSize: 12 }}>
                  {truncate(JSON.stringify(log.parameters), 80)}
                </td>
                <td style={{ padding: '6px 8px', color: '#f87171', fontSize: 12 }}>
                  {log.error ? truncate(log.error, 80) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination
        basePath="/admin/calls"
        page={page}
        hasNext={hasNext}
        extraParams={{ success: successFilter === undefined ? undefined : String(successFilter) }}
      />
    </Section>
  );
}
