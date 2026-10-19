'use client';

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="page-narrow">
      <h1>Não deu pra carregar o painel</h1>
      <p className="muted">
        Pode ser só uma instabilidade. Tenta de novo — se continuar, peça um novo link pelo WhatsApp.
      </p>
      <button type="button" onClick={reset} className="btn" style={{ marginTop: 16 }}>
        Tentar de novo
      </button>
    </main>
  );
}
