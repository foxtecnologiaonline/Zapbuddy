import { getSupabase } from "../db/supabase";
import { sendWhatsAppMessage } from "../lib/whatsapp";
import { Transaction } from "../types";

export async function runWeeklySummary(): Promise<void> {
  const supabase = getSupabase();
  const since = new Date();
  since.setDate(since.getDate() - 7);

  const { data: users } = await supabase.from("users").select("id, whatsapp_number").not("onboarded_at", "is", null);

  for (const user of users ?? []) {
    const { data: transactions } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .gte("occurred_at", since.toISOString());

    if (!transactions || transactions.length === 0) continue;

    await sendWhatsAppMessage(user.whatsapp_number, formatWeeklySummary(transactions as Transaction[]));
  }
}

function formatWeeklySummary(transactions: Transaction[]): string {
  const byCategory = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + t.amount_cents);
  }

  const lines = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, cents]) => `• ${category}: R$ ${(cents / 100).toFixed(2)}`);

  return `📅 Resumo da semana:\n${lines.join("\n") || "Nenhum gasto registrado."}`;
}
