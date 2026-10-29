export const metadata = { title: 'Painel indisponível · ZapBuddy' };

export default function PainelIndisponivel() {
  return (
    <main style={{ maxWidth: 480, margin: '15vh auto', padding: '0 24px', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
      <h1 style={{ fontSize: 22, marginBottom: 12 }}>O painel está fora do ar por enquanto</h1>
      <p style={{ color: '#555', lineHeight: 1.5 }}>
        Estamos ajustando algumas coisas por aqui. Enquanto isso, o Tom continua funcionando normalmente no WhatsApp: agenda,
        tarefas, notas e finanças, é só mandar mensagem ou áudio.
      </p>
    </main>
  );
}
