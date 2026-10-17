import { listUsers, USERS_PAGE_SIZE } from '@zapbuddy/db';
import type { PlanStatus } from '@zapbuddy/db';
import { EmptyState, Pagination, Section, formatDateTime } from '../components';

export const dynamic = 'force-dynamic';

const PLAN_STATUSES: PlanStatus[] = ['trial', 'active', 'canceled'];

interface ContactsPageProps {
  searchParams: Promise<{ page?: string; q?: string }>;
}

export default async function ContactsPage({ searchParams }: ContactsPageProps) {
  const { page: pageParam, q } = await searchParams;
  const page = Math.max(0, Number(pageParam) || 0);
  const { users, total } = await listUsers(page, q);
  const hasNext = (page + 1) * USERS_PAGE_SIZE < total;

  return (
    <Section title={`Contatos (${total})`}>
      <form method="GET" style={{ marginBottom: 16 }}>
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por número ou nome"
          style={{
            padding: '8px 10px',
            borderRadius: 6,
            border: '1px solid #2a3340',
            background: '#121821',
            color: '#e6edf3',
            fontSize: 13,
            width: 280,
          }}
        />
      </form>

      {users.length === 0 ? (
        <EmptyState>Nenhum contato encontrado.</EmptyState>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', opacity: 0.6 }}>
              <th style={{ padding: '4px 8px' }}>WhatsApp</th>
              <th style={{ padding: '4px 8px' }}>Nome</th>
              <th style={{ padding: '4px 8px' }}>Onboarding</th>
              <th style={{ padding: '4px 8px' }}>Criado em</th>
              <th style={{ padding: '4px 8px' }}>Assinatura</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} style={{ borderTop: '1px solid #1f2733' }}>
                <td style={{ padding: '6px 8px' }}>{user.whatsapp_number}</td>
                <td style={{ padding: '6px 8px' }}>{user.name ?? <span style={{ opacity: 0.5 }}>—</span>}</td>
                <td style={{ padding: '6px 8px', opacity: 0.7 }}>
                  {user.onboarding_completed_at ? 'completo' : 'pendente'}
                </td>
                <td style={{ padding: '6px 8px', opacity: 0.7 }}>{formatDateTime(user.created_at)}</td>
                <td style={{ padding: '6px 8px' }}>
                  <form action={`/api/admin/contacts/${user.id}/plan-status`} method="POST" style={{ display: 'inline' }}>
                    <select
                      name="status"
                      defaultValue={user.plan_status}
                      style={{
                        background: '#121821',
                        color: '#e6edf3',
                        border: '1px solid #2a3340',
                        borderRadius: 4,
                        padding: '2px 6px',
                        fontSize: 12,
                      }}
                    >
                      {PLAN_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      style={{
                        marginLeft: 6,
                        background: 'transparent',
                        border: '1px solid #2a3340',
                        color: '#9fb0c0',
                        borderRadius: 4,
                        padding: '2px 8px',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      Salvar
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination basePath="/admin/contacts" page={page} hasNext={hasNext} extraParams={{ q }} />
    </Section>
  );
}
