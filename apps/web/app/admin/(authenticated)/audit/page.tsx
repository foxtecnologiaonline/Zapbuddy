import { ADMIN_ACTION_LOGS_PAGE_SIZE, listAdminActionLogs } from '@zapbuddy/db';
import { EmptyState, Pagination, Section, TableScroll, formatDateTime } from '../components';

export const dynamic = 'force-dynamic';

const ACTION_LABELS: Record<string, string> = {
  plan_status_updated: 'Assinatura alterada',
  reminder_cancelled: 'Lembrete cancelado',
  evolution_instance_created: 'Instância Evolution criada',
  evolution_instance_deleted: 'Instância Evolution excluída',
};

interface AuditPageProps {
  searchParams: Promise<{ page?: string }>;
}

export default async function AuditPage({ searchParams }: AuditPageProps) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(0, Number(pageParam) || 0);
  const { logs, total } = await listAdminActionLogs(page);
  const hasNext = (page + 1) * ADMIN_ACTION_LOGS_PAGE_SIZE < total;

  return (
    <Section title={`Auditoria do admin (${total})`}>
      <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 16, maxWidth: 560 }}>
        Toda ação de escrita feita a partir deste painel (não confundir com <code>tool_call_logs</code>, que é da IA).
        Login hoje é senha única sem conta por admin — isto registra o quê e quando, não ainda quem.
      </p>
      {logs.length === 0 ? (
        <EmptyState>Nenhuma ação registrada ainda.</EmptyState>
      ) : (
        <TableScroll>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                <th style={{ padding: '4px 8px' }}>Quando</th>
                <th style={{ padding: '4px 8px' }}>Ação</th>
                <th style={{ padding: '4px 8px' }}>Alvo</th>
                <th style={{ padding: '4px 8px' }}>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderTop: '1px solid #1f2733' }}>
                  <td style={{ padding: '6px 8px', opacity: 0.7, whiteSpace: 'nowrap' }}>{formatDateTime(log.created_at)}</td>
                  <td style={{ padding: '6px 8px' }}>{ACTION_LABELS[log.action] ?? log.action}</td>
                  <td style={{ padding: '6px 8px', opacity: 0.7, fontFamily: 'monospace', fontSize: 12 }}>
                    {log.target_type}
                    {log.target_id ? `:${log.target_id.slice(0, 8)}…` : ''}
                  </td>
                  <td style={{ padding: '6px 8px', opacity: 0.7, fontFamily: 'monospace', fontSize: 12 }}>
                    {log.detail ? JSON.stringify(log.detail) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}

      <Pagination basePath="/admin/audit" page={page} hasNext={hasNext} />
    </Section>
  );
}
