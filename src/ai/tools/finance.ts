import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { withToolLogging } from "../logger.js";
import { db } from "../store.js";

/**
 * Categorização automática é responsabilidade do modelo (ele decide a
 * categoria e manda como parâmetro) — a tool só persiste. Isso é
 * deliberado: manter a lógica de "entendimento" no prompt/modelo e a tool
 * burra e auditável, fácil de trocar por Supabase depois.
 */
export function financeTools(userId: string) {
  const registrarTransacao = betaZodTool({
    name: "registrar_transacao",
    description:
      "Registra um gasto ou receita do usuário. Chame só depois de ter " +
      "valor e categoria claros — nunca registre com dados incompletos.",
    inputSchema: z.object({
      tipo: z.enum(["gasto", "receita"]),
      valorCentavos: z.number().int().positive(),
      categoria: z
        .string()
        .describe("categoria curta, ex: alimentação, transporte, vendas"),
      descricao: z.string(),
      data: z
        .string()
        .describe("data ISO 8601; use a data/hora atual se o usuário não disser outra"),
    }),
    run: withToolLogging("registrar_transacao", async (input) => {
      const row = db.salvarTransacao({ ...input, userId });
      return { ok: true, transacao: row };
    }),
  });

  const resumoFinanceiro = betaZodTool({
    name: "resumo_financeiro",
    description: "Retorna o resumo de gastos/receitas do período pedido.",
    inputSchema: z.object({
      periodo: z.enum(["diario", "semanal"]),
    }),
    run: withToolLogging("resumo_financeiro", async (input) => {
      const desde = new Date();
      if (input.periodo === "diario") desde.setHours(0, 0, 0, 0);
      else desde.setDate(desde.getDate() - 7);

      const transacoes = db.resumoTransacoes(userId, desde);
      const totalGastoCentavos = transacoes
        .filter((t) => t.tipo === "gasto")
        .reduce((sum, t) => sum + t.valorCentavos, 0);
      const totalReceitaCentavos = transacoes
        .filter((t) => t.tipo === "receita")
        .reduce((sum, t) => sum + t.valorCentavos, 0);

      return { ok: true, totalGastoCentavos, totalReceitaCentavos, transacoes };
    }),
  });

  return [registrarTransacao, resumoFinanceiro];
}
