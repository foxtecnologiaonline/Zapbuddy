'use client';

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main style={{ maxWidth: 480, margin: '80px auto', padding: 24, textAlign: 'center' }}>
      <h1>Não deu pra carregar o painel</h1>
      <p style={{ opacity: 0.7 }}>
        Pode ser só uma instabilidade. Tenta de novo — se continuar, peça um novo link pelo WhatsApp.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--fg)',
          borderRadius: 6,
          padding: '8px 16px',
          cursor: 'pointer',
          fontSize: 14,
          marginTop: 16,
        }}
      >
        Tentar de novo
      </button>
    </main>
  );
}
