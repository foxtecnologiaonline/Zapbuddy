interface LoginPageProps {
  searchParams: Promise<{ error?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  missing_token: 'Link inválido — falta o token de acesso.',
  invalid_or_expired: 'Esse link expirou ou já foi usado. Peça um novo pelo WhatsApp.',
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const errorMessage = error ? ERROR_MESSAGES[error] : undefined;

  return (
    <main style={{ maxWidth: 480, margin: '80px auto', padding: 24, textAlign: 'center' }}>
      <h1>ZapBuddy</h1>
      <p>Para acessar seu painel, peça o link de acesso no seu WhatsApp conectado ao ZapBuddy.</p>
      <p style={{ opacity: 0.7 }}>Basta mandar uma mensagem como &quot;quero ver o painel&quot;.</p>
      {errorMessage ? <p style={{ color: '#ff6b6b' }}>{errorMessage}</p> : null}
    </main>
  );
}
