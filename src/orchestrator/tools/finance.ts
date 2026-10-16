import { getSupabase } from "../../db/supabase";
import { AppError } from "../../lib/errors";
import { Transaction, TransactionType } from "../../types";

export const registrarTransacaoTool = {
  name: "registrar_transacao",
  description:
    "Registra um gasto ou receita como transação estruturada. Só chamar depois de ter tipo, valor, categoria e descrição claros.",
  input_schema: {
    type: "object" as const,
    properties: {
      type: { type: "string", enum: ["expense", "income"] },
      amountCents: { type: "integer", description: "Valor em centavos, sempre positivo" },
      category: { type: "string" },
      description: { type: "string" },
    },
    required: ["type", "amountCents", "category", "description"],
  },
};

// Regra não-negociável do projeto: o registro é persistido ANTES de qualquer confirmação ser
// possível. Se o insert falhar, a exception sobe e nenhuma mensagem de confirmação é enviada.
export async function registrarTransacao(
  userId: string,
  input: { type: TransactionType; amountCents: number; category: string; description: string }
): Promise<Transaction> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new AppError("amountCents inválido", "O valor precisa ser maior que zero.");
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      type: input.type,
      amount_cents: input.amountCents,
      category: input.category,
      description: input.description,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new AppError(
      `Falha ao persistir transação: ${error?.message}`,
      "Não consegui salvar esse registro agora. Nada foi confirmado — pode tentar de novo?"
    );
  }

  return data as Transaction;
}

export const corrigirCategoriaTool = {
  name: "corrigir_categoria",
  description:
    "Corrige a categoria de uma transação já registrada, sem criar um novo registro. Usar quando o usuário contesta a categorização automática.",
  input_schema: {
    type: "object" as const,
    properties: {
      transacaoId: { type: "string" },
      novaCategoria: { type: "string" },
    },
    required: ["transacaoId", "novaCategoria"],
  },
};

// Correção em 1 mensagem: aplica update no registro existente — não duplica a transação e vira
// dado direto pra ajustar o classificador.
export async function corrigirCategoria(
  userId: string,
  input: { transacaoId: string; novaCategoria: string }
): Promise<Transaction> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("transactions")
    .update({ category: input.novaCategoria })
    .eq("id", input.transacaoId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new AppError(
      `Falha ao corrigir categoria: ${error?.message}`,
      "Não encontrei esse registro para corrigir. Pode confirmar qual transação?"
    );
  }

  return data as Transaction;
}
