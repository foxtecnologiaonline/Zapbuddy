// Variáveis dummy pra módulos que validam env var na importação (ex: src/lib/supabase.ts)
// não quebrarem testes que nem usam Supabase de fato, só importam algo que o importa.
process.env.SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379';
process.env.ANTHROPIC_API_KEY ??= 'test-api-key';
