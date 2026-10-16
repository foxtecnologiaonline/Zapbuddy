import { redirect } from 'next/navigation';
import { isAdminRequest } from '@/lib/admin-auth';

interface AdminLoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  invalid_password: 'Senha incorreta.',
};

export default async function AdminLoginPage({ searchParams }: AdminLoginPageProps) {
  if (await isAdminRequest()) redirect('/admin');

  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>Admin do Tom</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>Acesso restrito à operação.</p>
      <form method="POST" action="/api/admin/login" style={{ marginTop: 16 }}>
        <input
          type="password"
          name="password"
          placeholder="Senha de admin"
          autoFocus
          required
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 6,
            border: '1px solid #2a3340',
            background: '#121821',
            color: '#e6edf3',
            fontSize: 14,
            boxSizing: 'border-box',
          }}
        />
        <button
          type="submit"
          style={{
            marginTop: 12,
            width: '100%',
            padding: '10px 12px',
            borderRadius: 6,
            border: 'none',
            background: '#4ade80',
            color: '#0b0f14',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Entrar
        </button>
      </form>
      {errorMessage ? <p style={{ color: '#f87171', marginTop: 12 }}>{errorMessage}</p> : null}
    </main>
  );
}
