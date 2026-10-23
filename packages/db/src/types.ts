export type PlanStatus = 'trial' | 'active' | 'canceled';
export type PlanIntent = 'upgrade' | 'cancel';
export type OnboardingVariant = 'ask_name_first' | 'ask_action_first';
export type PreferredPaymentMethod = 'pix' | 'boleto' | 'cartao';

export interface User {
  id: string;
  whatsapp_number: string;
  name: string | null;
  occupation: string | null;
  /** Como a pessoa pediu pra ser chamada (ex.: "Mari" em vez do nome completo "Marina") — separado de `name`, que é o dado formal do cadastro/dashboard. */
  preferred_name: string | null;
  timezone: string;
  onboarding_completed_at: string | null;
  onboarding_variant: OnboardingVariant;
  plan_status: PlanStatus;
  plan_status_updated_at: string | null;
  plan_intent: PlanIntent | null;
  plan_intent_requested_at: string | null;
  quiet_hours_start: number;
  quiet_hours_end: number;
  /** Preenchido quando a pessoa confirma via set_quiet_hours — diferente de quiet_hours_start/end, que sempre têm um valor (default 22/7) mesmo sem confirmação. */
  quiet_hours_confirmed_at: string | null;
  email: string | null;
  /** Cidade informada pela pessoa (set_city) — null = ainda usa a aproximação pelo DDD. Ver migration 0024. */
  city: string | null;
  city_uf: string | null;
  city_latitude: number | null;
  city_longitude: number | null;
  /** Preferências do resumo matinal (migration 0024). */
  morning_digest_enabled: boolean;
  morning_digest_hour: number;
  morning_digest_agenda: boolean;
  morning_digest_finance: boolean;
  /** Só a preferência declarada (nunca dado de pagamento real) — ver migration 0021. */
  preferred_payment_method: PreferredPaymentMethod | null;
  /** Exigência da Asaas (POST /customers) pra gerar checkout real — ver migration 0020. */
  cpf_cnpj: string | null;
  asaas_customer_id: string | null;
  asaas_subscription_id: string | null;
  asaas_payment_link: string | null;
  /** Fim do teste grátis de 3 dias (migration 0023) — passado isso sem `plan_status = 'active'`, o Tom bloqueia antes de chamar a IA (ver payments/trial-gate.ts). */
  trial_ends_at: string;
  created_at: string;
}

export type AccountRole = 'owner' | 'member';

export interface Account {
  id: string;
  name: string | null;
  referral_code: string;
  created_at: string;
}

export interface AccountMember {
  account_id: string;
  user_id: string;
  role: AccountRole;
  created_at: string;
}

export interface AccountInvite {
  id: string;
  account_id: string;
  code: string;
  created_by_user_id: string;
  expires_at: string;
  used_at: string | null;
  used_by_user_id: string | null;
  created_at: string;
}

export type TransactionType = 'expense' | 'income';
export type TransactionSource = 'text' | 'audio';

export interface Transaction {
  id: string;
  account_id: string;
  user_id: string;
  type: TransactionType;
  amount_cents: number;
  category: string;
  description: string | null;
  source: TransactionSource;
  raw_input: string | null;
  occurred_at: string;
  created_at: string;
}

export type TaskStatus = 'pending' | 'completed';

export interface Task {
  id: string;
  account_id: string;
  user_id: string;
  title: string;
  status: TaskStatus;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface MemoryFact {
  id: string;
  account_id: string;
  fact: string;
  created_by_user_id: string;
  created_at: string;
}

export interface Note {
  id: string;
  account_id: string;
  content: string;
  created_by_user_id: string;
  created_at: string;
}

export interface RecurringBill {
  id: string;
  account_id: string;
  name: string;
  amount_cents: number;
  due_day: number;
  active: boolean;
  created_by_user_id: string;
  created_at: string;
}

export interface ImportantDate {
  id: string;
  account_id: string;
  label: string;
  /** 1-12 — recorrente ano a ano, não uma data completa (ver migration 0018). */
  month: number;
  /** 1-31 */
  day: number;
  created_by_user_id: string;
  created_at: string;
}

export type SavingsGoalStatus = 'active' | 'completed' | 'cancelled';

/** Meta com valor-alvo e progresso declarado pela pessoa (distinta de PersonalGoal, que é qualitativa). */
export interface SavingsGoal {
  id: string;
  account_id: string;
  title: string;
  target_cents: number;
  saved_cents: number;
  deadline: string | null;
  status: SavingsGoalStatus;
  created_by_user_id: string;
  created_at: string;
  completed_at: string | null;
}

export type GoalStatus = 'pending' | 'done';

export interface PersonalGoal {
  id: string;
  account_id: string;
  description: string;
  status: GoalStatus;
  created_by_user_id: string;
  created_at: string;
  completed_at: string | null;
}

export interface Habit {
  id: string;
  account_id: string;
  name: string;
  active: boolean;
  created_by_user_id: string;
  created_at: string;
  archived_at: string | null;
}

export interface HabitCheckin {
  id: string;
  habit_id: string;
  account_id: string;
  /** Data local da pessoa (YYYY-MM-DD) — ver migration 0025. */
  checkin_date: string;
  created_by_user_id: string | null;
  created_at: string;
}

export type ReminderStatus = 'pending' | 'sent' | 'cancelled' | 'failed';
export type ReminderRecurrence = 'daily' | 'weekly' | 'monthly';

export interface Reminder {
  id: string;
  account_id: string;
  user_id: string;
  task_id: string | null;
  message: string;
  remind_at: string;
  status: ReminderStatus;
  failed_reason: string | null;
  recurrence: ReminderRecurrence | null;
  created_at: string;
}

export interface ToolCallLog {
  id: string;
  user_id: string | null;
  tool_name: string;
  parameters: Record<string, unknown>;
  result: unknown;
  success: boolean;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface WeeklyDigestLog {
  id: string;
  account_id: string;
  sent_at: string;
}

export interface Budget {
  id: string;
  account_id: string;
  category: string;
  limit_cents: number;
  period: 'monthly';
  created_at: string;
}

export interface MagicLink {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export type WebhookChannel = 'cloud-api' | 'evolution';
export type WebhookEventType = 'verify' | 'text' | 'audio' | 'document' | 'other' | 'rejected';
export type WebhookEventStatus = 'accepted' | 'rejected';

export interface WebhookEvent {
  id: string;
  channel: WebhookChannel;
  whatsapp_number: string | null;
  event_type: WebhookEventType;
  status: WebhookEventStatus;
  rejection_reason: string | null;
  created_at: string;
}

export type ErrorLogSource = 'webhook' | 'worker' | 'orchestrator' | 'web';

export interface ErrorLog {
  id: string;
  source: ErrorLogSource;
  message: string;
  detail: unknown;
  user_id: string | null;
  created_at: string;
}

export interface AdminActionLog {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: unknown;
  created_at: string;
}

export interface Document {
  id: string;
  account_id: string;
  uploaded_by_user_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  caption: string | null;
  /** O que o modelo leu no arquivo (descrição curta em pt-BR) — null enquanto não analisado ou quando o tipo não é analisável. */
  extracted_text: string | null;
  /** Campos estruturados lidos (tipo, estabelecimento, valor, datas) — ver ExtractedDocumentData em core. */
  extracted_data: Record<string, unknown> | null;
  created_at: string;
}

export type CalendarProvider = 'google' | 'microsoft';

export interface CalendarConnection {
  id: string;
  account_id: string;
  provider: CalendarProvider;
  refresh_token_encrypted: string;
  calendar_id: string;
  connected_by_user_id: string | null;
  connected_at: string;
}

export type ProactiveInsightSignalType = 'category_spike' | 'monthly_pace';

export interface ProactiveInsightLog {
  id: string;
  account_id: string;
  signal_type: ProactiveInsightSignalType;
  summary: string;
  sent_at: string;
}

export interface Referral {
  id: string;
  referrer_account_id: string;
  referred_account_id: string;
  created_at: string;
}

export interface ApiKey {
  id: string;
  account_id: string;
  name: string;
  key_hash: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export type WebhookEventTypePublic = 'transaction.created' | 'task.completed';

export interface WebhookSubscription {
  id: string;
  account_id: string;
  url: string;
  secret: string;
  event_types: WebhookEventTypePublic[];
  created_at: string;
  disabled_at: string | null;
}

export interface WebhookDeliveryLog {
  id: string;
  subscription_id: string;
  event_type: string;
  success: boolean;
  status_code: number | null;
  error: string | null;
  created_at: string;
}

export type KnowledgeEntryOrigin = 'user_query' | 'proactive_research' | 'categorization';

export interface KnowledgeEntry {
  id: string;
  origin: KnowledgeEntryOrigin;
  query: string;
  normalized_query: string;
  summary: string;
  source_urls: string[];
  embedding: number[] | null;
  user_id: string | null;
  created_at: string;
}

export interface SimilarKnowledgeEntry {
  id: string;
  origin: KnowledgeEntryOrigin;
  query: string;
  summary: string;
  source_urls: string[];
  created_at: string;
  similarity: number;
}

export interface InterpretationInsight {
  id: string;
  period_start: string;
  period_end: string;
  summary: string;
  stats: Record<string, unknown>;
  created_at: string;
}

export interface Contact {
  id: string;
  account_id: string;
  name: string;
  name_normalized: string;
  /** Só dígitos, com 55 + DDD. */
  whatsapp_number: string;
  last_inbound_at: string | null;
  opted_out_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
}

export type OutboundStatus = 'pending_confirmation' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled';
export type OutboundSendMode = 'free_form' | 'template';

export interface OutboundMessage {
  id: string;
  account_id: string;
  user_id: string;
  contact_id: string | null;
  recipient_name: string;
  recipient_number: string;
  body: string;
  status: OutboundStatus;
  send_mode: OutboundSendMode | null;
  created_turn_id: string;
  expires_at: string;
  wa_message_id: string | null;
  failed_reason: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface OutboundReply {
  id: string;
  outbound_message_id: string;
  account_id: string;
  wa_message_id: string;
  message_type: string;
  body: string | null;
  created_at: string;
}
