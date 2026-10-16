import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { withToolLogging } from "../logger.js";
import { db } from "../store.js";

export function onboardingTools(userId: string) {
  const salvarPerfilUsuario = betaZodTool({
    name: "salvar_perfil_usuario",
    description:
      "Salva o cadastro inicial do usuário (nome e tipo de negócio). " +
      "Chame uma vez, na primeira conversa.",
    inputSchema: z.object({
      nome: z.string(),
      tipoNegocio: z.enum(["MEI", "PJ", "autonomo"]).optional(),
    }),
    run: withToolLogging("salvar_perfil_usuario", async (input) => {
      const row = db.salvarPerfil({ userId, ...input });
      return { ok: true, perfil: row };
    }),
  });

  return [salvarPerfilUsuario];
}
