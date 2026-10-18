import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  findUserById,
  listRemindersByUser,
  listTasks,
  listToolCallLogsByUser,
  listTransactions,
} from '@zapbuddy/db';
import type { PlanStatus } from '@zapbuddy/db';
import { Badge, EmptyState, Section, formatDateTime } from '../../components';

export const dynamic = 'force-dynamic';

const PLAN_STATUSES: PlanStatus[] = ['trial', 'active', 'canceled'];
const HISTORY_LIMIT = 20;
// Sem janela de data no detalhe do contato (é "últimas N", não "últimos X dias") —
// listTransactions exige um range, então usa desde a época até agora.
const EPOCH_ISO = new Date(0).toISOString();

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await findUserById(id);
  if (!user) notFound();

  const [transactions, tasks, reminders, toolCalls] = await Promise.all([
    listTransactions(id, EPOCH_ISO, new Date().toISOString(), { limit: HISTORY_LIMIT }),
    listTasks(id, undefined, HISTORY_LIMIT),
    listRemindersByUser(id, HISTORY_LIMIT),
    listToolCallLogsByUser(id, HISTORY_LIMIT),
  ]);

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <Link href="/admin/contacts" style={{ color: '#9fb0c0', fontSize: 13 }}>
          ← Contatos
        </Link>
      </div>

      <Section title={user.name ?? user.whatsapp_number}>
        <table style={{ fontSize: 13, marginBottom: 16 }}>
          <tbody>
            <tr>
              <td style={{ padding: '4px 12px 4px 0', opacity: 0.6 }}>WhatsApp</td>
              <td style={{ padding: '4px 0' }}>{user.whatsapp_number}</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 12px 4px 0', opacity: 0.6 }}>Fuso</td>
              <td style={{ padding: '4px 0' }}>{user.timezone}</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 12px 4px 0', opacity: 0.6 }}>Onboarding</td>
              <td style={{ padding: '4px 0' }}>
                {user.onboarding_completed_at ? `completo em ${formatDateTime(user.onboarding_completed_at)}` : 'pendente'}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '4px 12px 4px 0', opacity: 0.6 }}>Contato desde</td>
              <td style={{ padding: '4px 0' }}>{formatDateTime(user.created_at)}</td>
            </tr>
          </tbody>
        </table>

        <form action={`/api/admin/contacts/${user.id}/plan-status`} method="POST" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ opacity: 0.6, fontSize: 13 }}>Assinatura:</span>
          <select
            name="status"
            defaultValue={user.plan_status}
            style={{ background: '#121821', color: '#e6edf3', border: '1px solid #2a3340', borderRadius: 4, padding: '4px 8px', fontSize: 13 }}
          >
            {PLAN_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button
            type="submit"
            style={{ background: 'transparent', border: '1px solid #2a3340', color: '#9fb0c0', borderRadius: 4, padding: '4px 10px', fontSize: 13, cursor: 'pointer' }}
          >
            Salvar
          </button>
        </form>
      </Section>

      <Section title={`Transações recentes (últimas ${HISTORY_LIMIT})`}>
        {transactions.length === 0 ? (
          <EmptyState>Nenhuma transação registrada.</EmptyState>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                <th style={{ padding: '4px 8px' }}>Quando</th>
                <th style={{ padding: '4px 8px' }}>Tipo</th>
                <th style={{ padding: '4px 8px' }}>Valor</th>
                <th style={{ padding: '4px 8px' }}>Categoria</th>
                <th style={{ padding: '4px 8px' }}>Descrição</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} style={{ borderTop: '1px solid #1f2733' }}>
                  <td style={{ padding: '6px 8px', opacity: 0.7, whiteSpace: 'nowrap' }}>{formatDateTime(t.occurred_at)}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <Badge tone={t.type === 'income' ? 'ok' : 'neutral'}>{t.type === 'income' ? 'receita' : 'despesa'}</Badge>
                  </td>
                  <td style={{ padding: '6px 8px' }}>{(t.amount_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
                  <td style={{ padding: '6px 8px', opacity: 0.7 }}>{t.category}</td>
                  <td style={{ padding: '6px 8px', opacity: 0.7 }}>{t.description ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Tarefas recentes (últimas ${HISTORY_LIMIT})`}>
        {tasks.length === 0 ? (
          <EmptyState>Nenhuma tarefa registrada.</EmptyState>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                <th style={{ padding: '4px 8px' }}>Título</th>
                <th style={{ padding: '4px 8px' }}>Status</th>
                <th style={{ padding: '4px 8px' }}>Prazo</th>
                <th style={{ padding: '4px 8px' }}>Criada em</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} style={{ borderTop: '1px solid #1f2733' }}>
                  <td style={{ padding: '6px 8px' }}>{task.title}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <Badge tone={task.status === 'completed' ? 'ok' : 'neutral'}>{task.status === 'completed' ? 'concluída' : 'pendente'}</Badge>
                  </td>
                  <td style={{ padding: '6px 8px', opacity: 0.7 }}>{task.due_at ? formatDateTime(task.due_at) : '—'}</td>
                  <td style={{ padding: '6px 8px', opacity: 0.7, whiteSpace: 'nowrap' }}>{formatDateTime(task.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Lembretes recentes (últimos ${HISTORY_LIMIT})`}>
        {reminders.length === 0 ? (
          <EmptyState>Nenhum lembrete registrado.</EmptyState>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                <th style={{ padding: '4px 8px' }}>Mensagem</th>
                <th style={{ padding: '4px 8px' }}>Status</th>
                <th style={{ padding: '4px 8px' }}>Disparo em</th>
              </tr>
            </thead>
            <tbody>
              {reminders.map((reminder) => (
                <tr key={reminder.id} style={{ borderTop: '1px solid #1f2733' }}>
                  <td style={{ padding: '6px 8px' }}>{reminder.message}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <Badge tone={reminder.status === 'sent' ? 'ok' : reminder.status === 'failed' ? 'bad' : 'neutral'}>
                      {reminder.status}
                    </Badge>
                  </td>
                  <td style={{ padding: '6px 8px', opacity: 0.7, whiteSpace: 'nowrap' }}>{formatDateTime(reminder.remind_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title={`Chamadas da IA (últimas ${HISTORY_LIMIT})`}
        action={
          <Link href={`/admin/calls?userId=${user.id}`} style={{ color: '#9fb0c0', fontSize: 13 }}>
            Ver todas →
          </Link>
        }
      >
        {toolCalls.length === 0 ? (
          <EmptyState>Nenhuma chamada registrada.</EmptyState>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', opacity: 0.6 }}>
                <th style={{ padding: '4px 8px' }}>Quando</th>
                <th style={{ padding: '4px 8px' }}>Tool</th>
                <th style={{ padding: '4px 8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {toolCalls.map((call) => (
                <tr key={call.id} style={{ borderTop: '1px solid #1f2733' }}>
                  <td style={{ padding: '6px 8px', opacity: 0.7, whiteSpace: 'nowrap' }}>{formatDateTime(call.created_at)}</td>
                  <td style={{ padding: '6px 8px' }}>{call.tool_name}</td>
                  <td style={{ padding: '6px 8px' }}>
                    {call.success ? <Badge tone="ok">ok</Badge> : <Badge tone="bad">falhou</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}
