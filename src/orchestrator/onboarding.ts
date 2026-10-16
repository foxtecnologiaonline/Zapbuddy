import { getSupabase } from "../db/supabase";

export type OnboardingState = "new" | "awaiting_reply" | "onboarded";

export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const supabase = getSupabase();
  const { data } = await supabase
    .from("users")
    .select("onboarded_at, onboarding_prompted_at")
    .eq("id", userId)
    .single();

  if (data?.onboarded_at) return "onboarded";
  if (data?.onboarding_prompted_at) return "awaiting_reply";
  return "new";
}

// Fricção mínima: só nome + um exemplo de uso, na mesma mensagem do usuário. Nenhum formulário.
export function onboardingPrompt(): string {
  return (
    "Oi! Eu sou o Tom 👋 Vou te ajudar a organizar suas finanças e tarefas por aqui.\n\n" +
    "Antes de começar: como posso te chamar? E já aproveita e me conta um gasto que você teve hoje " +
    '(ex: "sou a Ana, gastei 35 reais com almoço").'
  );
}

export async function markOnboardingPrompted(userId: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from("users").update({ onboarding_prompted_at: new Date().toISOString() }).eq("id", userId);
}

// Extração de nome aqui é heurística simples (primeira palavra da resposta); evolui para uma tool
// dedicada quando o orquestrador tiver um modo de reconhecimento de onboarding mais robusto.
export async function completeOnboarding(userId: string, firstMessage: string): Promise<string> {
  const name = firstMessage.trim().split(/\s+/)[0] || "você";
  const supabase = getSupabase();
  const { error } = await supabase
    .from("users")
    .update({ name, onboarded_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) throw new Error(`Falha ao concluir onboarding: ${error.message}`);
  return name;
}
