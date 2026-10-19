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
    <main className="page-narrow">
      <h1>Tom</h1>
      <p>Para acessar seu painel, peça o link de acesso no seu WhatsApp conectado ao Tom.</p>
      <p className="muted">Basta mandar uma mensagem como &quot;quero ver o painel&quot;.</p>
      {errorMessage ? <p className="notice notice-error">{errorMessage}</p> : null}
    </main>
  );
}
