import { getSupabaseClient } from '../client.js';
import type { OnboardingVariant, PlanIntent, PlanStatus, User } from '../types.js';
import { inferTimezoneFromWhatsappNumber } from '../timezone-from-ddd.js';
import { assignOnboardingVariant } from '../onboarding-variant.js';

// Números reais (com DDI+DDD) ficam nessa faixa de dígitos; um payload
// malformado (ex.: webhook com JID de grupo mal filtrado, ou um provider
// devolvendo string vazia) não deve virar um registro de usuário no banco.
const WHATSAPP_NUMBER_PATTERN = /^\d{10,15}$/;

export class InvalidWhatsappNumberError extends Error {
  constructor(whatsappNumber: string) {
    super(`Número de WhatsApp inválido: "${whatsappNumber}"`);
    this.name = 'InvalidWhatsappNumberError';
  }
}

export async function findUserByWhatsappNumber(whatsappNumber: string): Promise<User | null> {
  const { data, error } = await getSupabaseClient()
    .from('users')
    .select('*')
    .eq('whatsapp_number', whatsappNumber)
    .maybeSingle();

  if (error) throw error;
  return data as User | null;
}

export async function findUserById(userId: string): Promise<User | null> {
  const { data, error } = await getSupabaseClient()
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data as User | null;
}

/**
 * Fuso e variante de onboarding são calculados aqui, na criação — não dá
 * pra confiar só no default da coluna (sempre 'America/Sao_Paulo') nem num
 * split aleatório feito depois: precisam ser decididos uma vez, no exato
 * momento em que o número de WhatsApp é conhecido (ver ADR 0005).
 */
export async function createUser(whatsappNumber: string): Promise<User> {
  const { data, error } = await getSupabaseClient()
    .from('users')
    .insert({
      whatsapp_number: whatsappNumber,
      timezone: inferTimezoneFromWhatsappNumber(whatsappNumber),
      onboarding_variant: assignOnboardingVariant(whatsappNumber),
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as User;
}

/**
 * Ponto único de entrada de número de WhatsApp pro banco — valida antes de
 * ler ou criar, pra nenhum caller (webhook oficial, webhook Evolution, ou
 * futuro) precisar lembrar de validar por conta própria.
 */
export async function getOrCreateUser(whatsappNumber: string): Promise<User> {
  if (!WHATSAPP_NUMBER_PATTERN.test(whatsappNumber)) {
    throw new InvalidWhatsappNumberError(whatsappNumber);
  }
  const existing = await findUserByWhatsappNumber(whatsappNumber);
  if (existing) return existing;
  return createUser(whatsappNumber);
}

export async function completeOnboarding(userId: string, name: string, occupation?: string): Promise<User> {
  const update: Record<string, unknown> = { name, onboarding_completed_at: new Date().toISOString() };
  // Só sobrescreve occupation se foi informado nesta chamada — omitir não
  // deve apagar um valor já capturado em uma tentativa anterior.
  if (occupation !== undefined) update.occupation = occupation;

  const { data, error } = await getSupabaseClient()
    .from('users')
    .update(update)
    .eq('id', userId)
    .select('*')
    .single();

  if (error) throw error;
  return data as User;
}

export async function countUsers(): Promise<number> {
  const { count, error } = await getSupabaseClient().from('users').select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count ?? 0;
}

export async function countUsersSince(sinceIso: string): Promise<number> {
  const { count, error } = await getSupabaseClient()
    .from('users')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', sinceIso);

  if (error) throw error;
  return count ?? 0;
}

/** Contagem de contatos por status de assinatura, pra o card "Assinaturas" do admin. */
export async function countUsersByPlanStatus(): Promise<Record<PlanStatus, number>> {
  const { data, error } = await getSupabaseClient().from('users').select('plan_status');
  if (error) throw error;

  const counts: Record<PlanStatus, number> = { trial: 0, active: 0, canceled: 0 };
  for (const row of data ?? []) {
    const status = (row as { plan_status: PlanStatus }).plan_status;
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

const CONTACTS_PAGE_SIZE = 25;

export interface ListUsersResult {
  users: User[];
  total: number;
}

export type UsersSortColumn = 'created_at' | 'plan_status' | 'name';

const USERS_SORT_COLUMNS: UsersSortColumn[] = ['created_at', 'plan_status', 'name'];

export function isUsersSortColumn(value: string | undefined): value is UsersSortColumn {
  return USERS_SORT_COLUMNS.includes(value as UsersSortColumn);
}

/** Lista paginada de contatos pro admin, com busca opcional por número/nome e ordenação por coluna. */
export async function listUsers(
  page: number,
  search?: string,
  sort: UsersSortColumn = 'created_at',
  ascending = false,
): Promise<ListUsersResult> {
  const from = page * CONTACTS_PAGE_SIZE;
  const to = from + CONTACTS_PAGE_SIZE - 1;

  let query = getSupabaseClient()
    .from('users')
    .select('*', { count: 'exact' })
    // Critério secundário fixo em created_at: `name` pode ter duplicatas/nulls
    // e `plan_status` só tem 3 valores — sem um desempate estável a ordem
    // dentro do mesmo valor fica arbitrária entre loads.
    .order(sort, { ascending })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (search) {
    const term = search.replace(/[%,()]/g, '');
    query = query.or(`whatsapp_number.ilike.%${term}%,name.ilike.%${term}%`);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { users: (data ?? []) as User[], total: count ?? 0 };
}

/** Todos os contatos (sem paginação) pro export CSV — mesmo filtro de busca da listagem. */
export async function listAllUsersForExport(search?: string): Promise<User[]> {
  let query = getSupabaseClient().from('users').select('*').order('created_at', { ascending: false });
  if (search) {
    const term = search.replace(/[%,()]/g, '');
    query = query.or(`whatsapp_number.ilike.%${term}%,name.ilike.%${term}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as User[];
}

/** Só o created_at (sem o resto da linha) — uso: balde diário do sparkline "novos contatos" no admin. */
export async function listUserCreatedAtSince(sinceIso: string): Promise<string[]> {
  const { data, error } = await getSupabaseClient().from('users').select('created_at').gte('created_at', sinceIso);
  if (error) throw error;
  return (data ?? []).map((row) => (row as { created_at: string }).created_at);
}

export async function updateUserPlanStatus(userId: string, status: PlanStatus): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('users')
    // Zera plan_intent junto: o admin tratar o status manualmente é o que
    // "resolve" qualquer intenção de assinar/cancelar pendente — sem isso o
    // sinal ficava pra sempre na lista mesmo depois de já tratado.
    .update({
      plan_status: status,
      plan_status_updated_at: new Date().toISOString(),
      plan_intent: null,
      plan_intent_requested_at: null,
    })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Registra que a pessoa manifestou (nessa conversa, por mensagem) intenção
 * de assinar ou cancelar — momento de venda do Tom (ADR 0004). Não dispara
 * cobrança nem muda plan_status sozinho: só grava o sinal estruturado que o
 * admin vê no painel e trata manualmente, igual já funciona hoje pra
 * plan_status (não há gateway de pagamento decidido ainda).
 */
export async function registerPlanIntent(userId: string, intent: PlanIntent): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('users')
    .update({ plan_intent: intent, plan_intent_requested_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * A pessoa pede explicitamente pra ser chamada de outro jeito (ex.: "pode me
 * chamar de Mari") — separado de `name` (completeOnboarding acima), que é o
 * dado formal do cadastro/dashboard. `null` limpa a preferência (volta a
 * usar `name`).
 */
export async function setPreferredName(userId: string, preferredName: string | null): Promise<User> {
  const { data, error } = await getSupabaseClient()
    .from('users')
    .update({ preferred_name: preferredName })
    .eq('id', userId)
    .select('*')
    .single();

  if (error) throw error;
  return data as User;
}

/** CPF/CNPJ só é pedido quando a pessoa topa assinar de verdade (ver register_plan_intent) — exigência da Asaas, não dado capturado antecipadamente. */
export async function saveUserCpfCnpj(userId: string, cpfCnpj: string): Promise<void> {
  const { error } = await getSupabaseClient().from('users').update({ cpf_cnpj: cpfCnpj }).eq('id', userId);
  if (error) throw error;
}

/** Grava o vínculo com o cliente/assinatura da Asaas + o link de checkout, pra reusar sem chamada nova à API em pedidos seguintes. */
export async function saveAsaasSubscription(
  userId: string,
  customerId: string,
  subscriptionId: string,
  paymentLink: string,
): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('users')
    .update({ asaas_customer_id: customerId, asaas_subscription_id: subscriptionId, asaas_payment_link: paymentLink })
    .eq('id', userId);
  if (error) throw error;
}

/** Usado pelo webhook de pagamento confirmado (apps/web/app/api/payments/webhook-asaas) pra achar quem ativar. */
export async function findUserByAsaasSubscriptionId(subscriptionId: string): Promise<User | null> {
  const { data, error } = await getSupabaseClient()
    .from('users')
    .select('*')
    .eq('asaas_subscription_id', subscriptionId)
    .maybeSingle();

  if (error) throw error;
  return data as User | null;
}

export async function setQuietHours(userId: string, startHour: number, endHour: number): Promise<User> {
  const { data, error } = await getSupabaseClient()
    .from('users')
    .update({ quiet_hours_start: startHour, quiet_hours_end: endHour })
    .eq('id', userId)
    .select('*')
    .single();

  if (error) throw error;
  return data as User;
}

/** Contagem de pedidos de assinatura aguardando contato humano, pro admin overview. */
export async function countPendingUpgradeIntents(): Promise<number> {
  const { count, error } = await getSupabaseClient()
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('plan_intent', 'upgrade');

  if (error) throw error;
  return count ?? 0;
}

export const USERS_PAGE_SIZE = CONTACTS_PAGE_SIZE;

export interface OnboardingFunnelVariantStats {
  variant: OnboardingVariant;
  total: number;
  completed: number;
  /** Onboarding incompleto e cadastro feito há mais de 24h — candidato a reengajamento manual. */
  stalledOver24h: number;
  /** null quando essa variante ainda não tem nenhum onboarding completo. */
  avgCompletionMinutes: number | null;
}

const STALLED_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Funil de onboarding por variante (ADR 0005) — não é feature de produto,
 * é a mesma observabilidade operacional do resto do admin (ver
 * 0004_admin.sql), só que medindo conversão em vez de volume. Lê a tabela
 * inteira e agrega em JS (sem RPC/SQL agregado) — aceitável no tamanho atual
 * da base, mesmo raciocínio de `countAllRows`.
 */
export async function getOnboardingFunnel(): Promise<OnboardingFunnelVariantStats[]> {
  const { data, error } = await getSupabaseClient()
    .from('users')
    .select('onboarding_variant, created_at, onboarding_completed_at');
  if (error) throw error;

  const now = Date.now();
  const byVariant = new Map<OnboardingVariant, { total: number; completed: number; stalledOver24h: number; completionMinutesSum: number }>();

  for (const row of (data ?? []) as Pick<User, 'onboarding_variant' | 'created_at' | 'onboarding_completed_at'>[]) {
    const bucket = byVariant.get(row.onboarding_variant) ?? {
      total: 0,
      completed: 0,
      stalledOver24h: 0,
      completionMinutesSum: 0,
    };
    bucket.total += 1;
    if (row.onboarding_completed_at) {
      bucket.completed += 1;
      bucket.completionMinutesSum +=
        (new Date(row.onboarding_completed_at).getTime() - new Date(row.created_at).getTime()) / 60_000;
    } else if (now - new Date(row.created_at).getTime() > STALLED_THRESHOLD_MS) {
      bucket.stalledOver24h += 1;
    }
    byVariant.set(row.onboarding_variant, bucket);
  }

  return Array.from(byVariant.entries()).map(([variant, bucket]) => ({
    variant,
    total: bucket.total,
    completed: bucket.completed,
    stalledOver24h: bucket.stalledOver24h,
    avgCompletionMinutes: bucket.completed > 0 ? Math.round(bucket.completionMinutesSum / bucket.completed) : null,
  }));
}
