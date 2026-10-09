import { redirect } from 'next/navigation';
import { findUserById, listTransactions, listTasks } from '@zapbuddy/db';
import { getCurrentUserId } from '@/lib/auth';
import { getCurrentMonthRange } from '@/lib/timezone';

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default async function DashboardPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/login');

  const user = await findUserById(userId);
  if (!user) redirect('/login');

  const { startIso, endIso } = getCurrentMonthRange(user.timezone);

  const [transactions, pendingTasks] = await Promise.all([
    listTransactions(userId, startIso, endIso),
    listTasks(userId, 'pending'),
  ]);

  const totalIncome = transactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount_cents, 0);
  const totalExpense = transactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount_cents, 0);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Olá, {user.name ?? 'usuário'}</h1>
          <p style={{ opacity: 0.7, margin: 0 }}>Painel somente leitura — mês atual.</p>
        </div>
        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            style={{
              background: 'transparent',
              border: '1px solid #2a3340',
              color: '#e6edf3',
              borderRadius: 6,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Sair
          </button>
        </form>
      </div>

      <section style={{ display: 'flex', gap: 16, margin: '24px 0' }}>
        <div style={{ flex: 1, background: '#121821', borderRadius: 8, padding: 16 }}>
          <div style={{ opacity: 0.6, fontSize: 13 }}>Receitas</div>
          <div style={{ fontSize: 24 }}>{formatCents(totalIncome)}</div>
        </div>
        <div style={{ flex: 1, background: '#121821', borderRadius: 8, padding: 16 }}>
          <div style={{ opacity: 0.6, fontSize: 13 }}>Gastos</div>
          <div style={{ fontSize: 24 }}>{formatCents(totalExpense)}</div>
        </div>
      </section>

      <section>
        <h2>Tarefas pendentes</h2>
        {pendingTasks.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Nenhuma tarefa pendente.</p>
        ) : (
          <ul>
            {pendingTasks.map((task) => (
              <li key={task.id}>{task.title}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>Últimas transações</h2>
        {transactions.length === 0 ? (
          <p style={{ opacity: 0.6 }}>Nenhuma transação este mês.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {transactions.slice(0, 20).map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid #1f2733' }}>
                  <td style={{ padding: '6px 0' }}>
                    {new Date(t.occurred_at).toLocaleDateString('pt-BR', { timeZone: user.timezone })}
                  </td>
                  <td>{t.category}</td>
                  <td style={{ textAlign: 'right', color: t.type === 'income' ? '#4ade80' : '#f87171' }}>
                    {t.type === 'income' ? '+' : '-'}
                    {formatCents(t.amount_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
