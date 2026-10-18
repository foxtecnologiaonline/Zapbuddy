import Link from 'next/link';
import { listReminders, REMINDERS_PAGE_SIZE } from '@zapbuddy/db';
import type { ReminderStatus } from '@zapbuddy/db';
import { Badge, EmptyState, Pagination, Section, formatDateTime } from '../components';

export const dynamic = 'force-dynamic';

const STATUSES: ReminderStatus[] = ['pending', 'sent', 'failed', 'cancelled'];

function badgeTone(status: ReminderStatus): 'ok' | 'bad' | 'neutral' {
  if (status === 'sent') return 'ok';
  if (status === 'failed') return 'bad';
  return 'neutral';
}

interface RemindersPageProps {
  searchParams: Promise<{ page?: string; status?: string }>;
}

export default async function RemindersPage({ searchParams }: RemindersPageProps) {
  const { page: pageParam, status } = await searchParams;
  const page = Math.max(0, Number(pageParam) || 0);
  const statusFilter = STATUSES.includes(status as ReminderStatus) ? (status as ReminderStatus) : undefined;

  const { reminders, total } = await listReminders(page, statusFilter);
  const hasNext = (page + 1) * REMINDERS_PAGE_SIZE < total;

  return (
    <Section title={`Lembretes (${total})`}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, fontSize: 13 }}>
        <Link href="/admin/reminders" style={{ color: statusFilter === undefined ? '#e6edf3' : '#9fb0c0' }}>
          Todos
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/reminders?status=${s}`} style={{ color: statusFilter === s ? '#e6edf3' : '#9fb0c0' }}>
            {s}
          </Link>
        ))}
      </div>

      {reminders.length === 0 ? (
        <EmptyState>Nenhum lembrete encontrado.</EmptyState>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', opacity: 0.6 }}>
              <th style={{ padding: '4px 8px' }}>Disparo em</th>
              <th style={{ padding: '4px 8px' }}>Contato</th>
              <th style={{ padding: '4px 8px' }}>Mensagem</th>
              <th style={{ padding: '4px 8px' }}>Status</th>
              <th style={{ padding: '4px 8px' }}>Ação</th>
            </tr>
          </thead>
          <tbody>
            {reminders.map((reminder) => (
              <tr key={reminder.id} style={{ borderTop: '1px solid #1f2733' }}>
                <td style={{ padding: '6px 8px', opacity: 0.7, whiteSpace: 'nowrap' }}>{formatDateTime(reminder.remind_at)}</td>
                <td style={{ padding: '6px 8px' }}>
                  <Link href={`/admin/contacts/${reminder.user_id}`} style={{ color: '#9fb0c0' }}>
                    {reminder.users?.name ?? reminder.users?.whatsapp_number ?? reminder.user_id.slice(0, 8)}
                  </Link>
                </td>
                <td style={{ padding: '6px 8px' }}>{reminder.message}</td>
                <td style={{ padding: '6px 8px' }}>
                  <Badge tone={badgeTone(reminder.status)}>{reminder.status}</Badge>
                </td>
                <td style={{ padding: '6px 8px' }}>
                  {reminder.status === 'pending' || reminder.status === 'failed' ? (
                    <form action={`/api/admin/reminders/${reminder.id}/cancel`} method="POST" style={{ display: 'inline' }}>
                      <button
                        type="submit"
                        style={{ background: 'transparent', border: '1px solid #2a3340', color: '#f87171', borderRadius: 4, padding: '2px 8px', fontSize: 12, cursor: 'pointer' }}
                      >
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <span style={{ opacity: 0.4 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pagination basePath="/admin/reminders" page={page} hasNext={hasNext} extraParams={{ status: statusFilter }} />
    </Section>
  );
}
