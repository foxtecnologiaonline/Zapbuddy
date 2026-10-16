import { getSupabase } from "../db/supabase";
import { Transaction, Task } from "../types";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

// Curto prazo: só as últimas mensagens da conversa, em memória de processo — nunca é onde um
// fato financeiro vive. Se o processo reiniciar, perde-se o histórico de conversa, não dado.
const conversationMemory = new Map<string, ConversationTurn[]>();
const MAX_TURNS = 10;

export function getConversationContext(userId: string): ConversationTurn[] {
  return conversationMemory.get(userId) ?? [];
}

export function appendConversationTurn(userId: string, turn: ConversationTurn): void {
  const turns = conversationMemory.get(userId) ?? [];
  turns.push(turn);
  conversationMemory.set(userId, turns.slice(-MAX_TURNS));
}

// Longo prazo: dado estruturado, buscado do Postgres a cada turno — nunca depende do que
// sobreviveu na conversa. É por isso que o Tom "lembra" uma transação mesmo após mudar de assunto.
export async function getStructuredSnapshot(
  userId: string
): Promise<{ recentTransactions: Transaction[]; pendingTasks: Task[] }> {
  const supabase = getSupabase();

  const [{ data: transactions }, { data: tasks }] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(5),
    supabase.from("tasks").select("*").eq("user_id", userId).eq("status", "pending").limit(10),
  ]);

  return {
    recentTransactions: (transactions ?? []) as Transaction[],
    pendingTasks: (tasks ?? []) as Task[],
  };
}
