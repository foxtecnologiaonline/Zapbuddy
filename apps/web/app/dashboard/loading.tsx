export default function DashboardLoading() {
  const skeletonStyle = { background: 'var(--card-bg)', borderRadius: 8 };

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <div style={{ ...skeletonStyle, width: 220, height: 28, marginBottom: 24 }} />
      <section className="cards-row">
        <div style={{ ...skeletonStyle, height: 72 }} />
        <div style={{ ...skeletonStyle, height: 72 }} />
      </section>
      <div style={{ ...skeletonStyle, height: 120 }} />
    </main>
  );
}
