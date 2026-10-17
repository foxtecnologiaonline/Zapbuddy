export type PlanStatus = 'trial' | 'active' | 'canceled';

export interface User {
  id: string;
  whatsapp_number: string;
  name: string | null;
  timezone: string;
  onboarding_completed_at: string | null;
  plan_status: PlanStatus;
  plan_status_updated_at: string | null;
  created_at: string;
}

export type AccountRole = 'owner' | 'member';

export interface Account {
  id: string;
  name: string | null;
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

export type ReminderStatus = 'pending' | 'sent' | 'cancelled' | 'failed';

export interface Reminder {
  id: string;
  account_id: string;
  user_id: string;
  task_id: string | null;
  message: string;
  remind_at: string;
  status: ReminderStatus;
  failed_reason: string | null;
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

export interface Document {
  id: string;
  account_id: string;
  uploaded_by_user_id: string | null;
  storage_path: string;
  file_name: string;
  mime_type: string;
  caption: string | null;
  created_at: string;
}

export interface CalendarConnection {
  id: string;
  account_id: string;
  google_refresh_token_encrypted: string;
  google_calendar_id: string;
  connected_by_user_id: string | null;
  connected_at: string;
}
