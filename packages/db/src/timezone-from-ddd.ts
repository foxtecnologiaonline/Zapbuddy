const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/**
 * DDD → fuso diferente do padrão. O resto do Brasil cai em
 * 'America/Sao_Paulo' (UTC-3, mesmo offset desde o fim do horário de verão
 * em 2019 — sem variação sazonal pra nenhum desses fusos hoje).
 * Fernando de Noronha (fuso próprio, UTC-2) compartilha o DDD 81 com
 * Recife/PE — sem jeito de distinguir só pelo DDD, fica a aproximação
 * (poucas centenas de habitantes vs. milhões em Pernambuco). Amazonas (DDD
 * 97) tem uma área a oeste (região de Eirunepe, UTC-5) que também não é
 * distinguível do resto do estado (UTC-4) só pelo DDD — mesma aproximação,
 * documentada aqui em vez de silenciosa.
 */
const DDD_TIMEZONE_EXCEPTIONS: Record<string, string> = {
  '68': 'America/Rio_Branco', // Acre, UTC-5
  '92': 'America/Manaus', // Amazonas (capital/leste), UTC-4
  '97': 'America/Manaus', // Amazonas (interior/oeste), UTC-4 — aproximação, ver comentário acima
  '65': 'America/Cuiaba', // Mato Grosso, UTC-4
  '66': 'America/Cuiaba', // Mato Grosso, UTC-4
  '67': 'America/Campo_Grande', // Mato Grosso do Sul, UTC-4
  '69': 'America/Porto_Velho', // Rondônia, UTC-4
  '95': 'America/Boa_Vista', // Roraima, UTC-4
};

/**
 * Infere o fuso a partir do DDD embutido no número de WhatsApp — sem isso,
 * todo usuário cai no default 'America/Sao_Paulo' da coluna (0001_init.sql),
 * o que resolve "ontem"/"hoje de manhã" errado pra quem mora num fuso
 * diferente (ex.: Manaus, Rio Branco) desde o primeiro dia, silenciosamente.
 * Só reconhece número brasileiro (DDI 55, 12 ou 13 dígitos no total — DDD +
 * 8 ou 9 dígitos de linha); outro DDI cai no default, porque não há como
 * inferir o fuso de um DDD de outro país sem uma tabela própria, que não
 * cabe no nicho atual (100% Brasil).
 */
export function inferTimezoneFromWhatsappNumber(whatsappNumber: string): string {
  const isBrazilianNumber = whatsappNumber.startsWith('55') && (whatsappNumber.length === 12 || whatsappNumber.length === 13);
  if (!isBrazilianNumber) return DEFAULT_TIMEZONE;

  const ddd = whatsappNumber.slice(2, 4);
  return DDD_TIMEZONE_EXCEPTIONS[ddd] ?? DEFAULT_TIMEZONE;
}
