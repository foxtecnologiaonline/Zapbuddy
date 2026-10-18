import { countToolCallLogsForFilters, listToolCallLogsCursorPage } from '@zapbuddy/db';
import { Badge, CursorPagination, EmptyState, Section, TableScroll, formatDateTime } from '../components';

export const dynamic = 'force-dynamic';

interface CallsPageProps {
  searchParams: Promise<{ cursor?: string; history?: string; success?: string; tool?: string; userId?: string }>;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export default async function CallsPage({ searchParams }: CallsPageProps) {
  const { cursor: cursorParam, history: historyParam, success, tool, userId } = await searchParams;
  const cursor = cursorParam ?? '';
  const history = historyParam ? historyParam.split(',') : [];
  const successFilter = success === 'true' ? true : success === 'false' ? false : undefined;
  const toolFilter = tool || undefined;
  const userIdFilter = userId || undefined;
  const filters = { success: successFilter, toolName: toolFilter, userId: userIdFilter };

  const [{ logs, nextCursor }, total] = await Promise.all([
    listToolCallLogsCursorPage(filters, cursor || undefined),
    countToolCallLogsForFilters(filters),
  ]);

  const buildHref = (overrides: { success?: string; tool?: string; userId?: string }) => {
    const params = new URLSearchParams();
    const merged = { success: successFilter === undefined ? undefined : String(successFilter), tool: toolFilter, userId: userIdFilter, ...overrides };
    if (merged.success) params.set('success', merged.success);
    if (merged.tool) params.set('tool', merged.tool);
    if (merged.userId) params.set('userId', merged.userId);
    const qs = params.toString();
    return qs ? `/admin/calls?${qs}` : '/admin/calls';
  };

  const exportParams = new URLSearchParams();
  if (successFilter !== undefined) exportParams.set('success', String(successFilter));
  if (toolFilter) exportParams.set('tool', toolFilter);
  if (userIdFilter) exportParams.set('userId', userIdFilter);
  const exportQs = exportParams.toString();

  return (
    <Section
      title={`Chamadas da IA (${total})`}
      action={
        <a href={`/api/admin/calls/export${exportQs ? `?${exportQs}` : ''}`} style={{ color: '#9fb0c0', fontSize: 13 }}>
          Exportar CSV (últimas 5000) →
        </a>
      }
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, fontSize: 13 }}>
        <a href={buildHref({ success: '' })} style={{ color: successFilter === undefined ? '#e6edf3' : '#9fb0c0' }}>
          Todas
        </a>
        <a href={buildHref({ success: 'true' })} style={{ color: successFilter === true ? '#e6edf3' : '#9fb0c0' }}>
          Sucesso
        </a>
        <a href={buildHref({ success: 'false' })} style={{ color: successFilter === false ? '#e6edf3' : '#9fb0c0' }}>
          Falha
        </a>
      </div>

      <form method="GET" style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {successFilter !== undefined ? <input type="hidden" name="success" value={String(successFilter)} /> : null}
        <input
          type="text"
          name="tool"
          defaultValue={toolFilter}
          placeholder="Filtrar por tool_name"
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid #2a3340',
            background: '#121821',
            color: '#e6edf3',
            fontSize: 13,
            width: 220,
          }}
        />
        {userIdFilter ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, opacity: 0.7 }}>
            <input type="hidden" name="userId" value={userIdFilter} />
            contato: {userIdFilter.slice(0, 8)}…
            <a href={buildHref({ userId: '' })} style={{ color: '#9fb0c0' }}>
              ✕
            </a>
          </span>
        ) : null}
        <button
          type="submit"
          style={{
            background: 'transparent',
            border: '1px solid #2a3340',
            color: '#9fb0c0',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Filtrar
        </button>
      </form>

      {logs.length === 0 ? (
        <EmptyState>Nenhuma chamada registrada.</EmptyState>
      ) : (
        <TableScroll>
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
        </TableScroll>
      )}

      <CursorPagination
        basePath="/admin/calls"
        cursor={cursor}
        history={history}
        nextCursor={nextCursor}
        extraParams={{ success: successFilter === undefined ? undefined : String(successFilter), tool: toolFilter, userId: userIdFilter }}
      />
    </Section>
  );
}
