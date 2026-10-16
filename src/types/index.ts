export interface User {
  id: string;
  whatsapp_number: string;
  name: string | null;
  onboarded_at: string | null;
  onboarding_prompted_at: string | null;
  created_at: string;
}

export type TransactionType = "expense" | "income";

export interface Transaction {
  id: string;
  user_id: string;
  type: TransactionType;
  amount_cents: number;
  category: string;
  description: string;
  occurred_at: string;
  created_at: string;
}

export type TaskStatus = "pending" | "done";

export interface Task {
  id: string;
  user_id: string;
  title: string;
  due_at: string | null;
  status: TaskStatus;
  created_at: string;
  completed_at: string | null;
}

export interface ToolCallLog {
  id: string;
  user_id: string | null;
  tool_name: string;
  params: Record<string, unknown>;
  result: unknown;
  error: string | null;
  duration_ms: number;
  created_at: string;
}
