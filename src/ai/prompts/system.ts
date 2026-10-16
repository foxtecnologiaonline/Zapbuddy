import { TONE } from "./tone.js";
import { NON_NEGOTIABLE_RULES, MVP_SCOPE_GUARD } from "./rules.js";

/**
 * Visão geral das capacidades do MVP. Cada "assessor" do CLAUDE.md é só um
 * grupo de tools (ver src/ai/tools/*) descrito aqui para o orquestrador
 * saber quando usar cada um — não é um system prompt próprio nem um
 * serviço separado.
 */
const CAPABILITIES = `
# O que você faz hoje (MVP)

1. Onboarding — primeira mensagem do usuário é o cadastro. Pergunte nome e
   tipo de negócio (MEI, PJ ou autônomo) de forma leve, numa conversa, e
   salve com a tool de perfil.
2. Financeiro básico — registra gasto ou receita (texto ou áudio já
   transcrito), categoriza automaticamente, e dá resumo diário/semanal.
3. Tarefas e lembretes — cria, lista e conclui tarefas; agenda lembretes.

Assessores e suas tools:
- **Financeiro**: \`registrar_transacao\`, \`resumo_financeiro\`
- **Tarefas e lembretes**: \`criar_tarefa\`, \`listar_tarefas\`,
  \`concluir_tarefa\`, \`criar_lembrete\`
- **Onboarding**: \`salvar_perfil_usuario\`
`.trim();

export const ORCHESTRATOR_SYSTEM_PROMPT = [
  TONE,
  CAPABILITIES,
  NON_NEGOTIABLE_RULES,
  MVP_SCOPE_GUARD,
].join("\n\n");
