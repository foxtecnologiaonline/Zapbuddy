import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { withToolLogging } from "../logger.js";
import { db } from "../store.js";

export function taskTools(userId: string) {
  const criarTarefa = betaZodTool({
    name: "criar_tarefa",
    description: "Cria uma tarefa para o usuário.",
    inputSchema: z.object({
      titulo: z.string(),
      descricao: z.string().optional(),
      dataVencimento: z
        .string()
        .optional()
        .describe("data ISO 8601, se o usuário mencionar um prazo"),
    }),
    run: withToolLogging("criar_tarefa", async (input) => {
      const row = db.criarTarefa({ ...input, userId });
      return { ok: true, tarefa: row };
    }),
  });

  const listarTarefas = betaZodTool({
    name: "listar_tarefas",
    description: "Lista as tarefas do usuário, opcionalmente filtrando por status.",
    inputSchema: z.object({
      status: z.enum(["pendente", "concluida"]).optional(),
    }),
    run: withToolLogging("listar_tarefas", async (input) => {
      return { ok: true, tarefas: db.listarTarefas(userId, input.status) };
    }),
  });

  const concluirTarefa = betaZodTool({
    name: "concluir_tarefa",
    description: "Marca uma tarefa como concluída pelo id.",
    inputSchema: z.object({ tarefaId: z.string() }),
    run: withToolLogging("concluir_tarefa", async (input) => {
      const row = db.concluirTarefa(userId, input.tarefaId);
      if (!row) return { ok: false, motivo: "tarefa não encontrada" };
      return { ok: true, tarefa: row };
    }),
  });

  const criarLembrete = betaZodTool({
    name: "criar_lembrete",
    description: "Agenda um lembrete pontual para o usuário.",
    inputSchema: z.object({
      titulo: z.string(),
      dataHora: z.string().describe("data/hora ISO 8601 do lembrete"),
    }),
    run: withToolLogging("criar_lembrete", async (input) => {
      const row = db.criarLembrete({ ...input, userId });
      return { ok: true, lembrete: row };
    }),
  });

  return [criarTarefa, listarTarefas, concluirTarefa, criarLembrete];
}
