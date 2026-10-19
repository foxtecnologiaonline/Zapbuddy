export default function DashboardLoading() {
  return (
    <main className="page" aria-busy="true" aria-label="Carregando painel">
      <div className="skeleton" style={{ width: 220, height: 32, marginBottom: 24 }} />
      <div className="kpis">
        <div className="skeleton" style={{ height: 84 }} />
        <div className="skeleton" style={{ height: 84 }} />
        <div className="skeleton" style={{ height: 84 }} />
        <div className="skeleton" style={{ height: 84 }} />
      </div>
      <div className="grid">
        <div className="skeleton" style={{ height: 200 }} />
        <div className="skeleton" style={{ height: 200 }} />
        <div className="skeleton span-2" style={{ height: 240 }} />
      </div>
    </main>
  );
}
