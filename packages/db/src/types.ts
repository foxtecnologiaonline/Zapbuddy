export interface User {
  id: string;
  whatsapp_number: string;
  name: string | null;
  timezone: string;
  onboarding_completed_at: string | null;
  created_at: string;
}

export type TransactionType = 'expense' | 'income';
export type TransactionSource = 'text' | 'audio';

export interface Transaction {
  id: string;
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
