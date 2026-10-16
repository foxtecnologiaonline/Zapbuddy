import { getSupabase } from "../db/supabase";
import { sendWhatsAppMessage } from "../lib/whatsapp";
import { Transaction } from "../types";

export async function runDailySummary(): Promise<void> {
  const supabase = getSupabase();
  const since = new Date();
  since.setHours(0, 0, 0, 0);

  const { data: users } = await supabase.from("users").select("id, whatsapp_number").not("onboarded_at", "is", null);

  for (const user of users ?? []) {
    const { data: transactions } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .gte("occurred_at", since.toISOString());

    if (!transactions || transactions.length === 0) continue;

    await sendWhatsAppMessage(user.whatsapp_number, formatDailySummary(transactions as Transaction[]));
  }
}

function formatDailySummary(transactions: Transaction[]): string {
  const expenses = transactions.filter((t) => t.type === "expense");
  const income = transactions.filter((t) => t.type === "income");
  const totalExpenses = expenses.reduce((sum, t) => sum + t.amount_cents, 0) / 100;
  const totalIncome = income.reduce((sum, t) => sum + t.amount_cents, 0) / 100;

  return (
    `📊 Resumo de hoje:\n` +
    `Gastos: R$ ${totalExpenses.toFixed(2)} (${expenses.length} registro${expenses.length === 1 ? "" : "s"})\n` +
    `Receitas: R$ ${totalIncome.toFixed(2)} (${income.length} registro${income.length === 1 ? "" : "s"})`
  );
}
