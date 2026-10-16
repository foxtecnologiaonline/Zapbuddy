/**
 * Store em memória — placeholder só para as tools terem onde persistir
 * enquanto a camada Supabase (Postgres) não existe. CLAUDE.md é claro que
 * "a IA nunca inventa dado financeiro; toda transação/tarefa é persistida
 * como registro estruturado antes de qualquer resposta confirmar a ação" —
 * este store existe para que esse contrato já valha mesmo antes do banco
 * real entrar. Troque por chamadas ao Supabase sem mudar a assinatura das
 * tools.
 */

export interface Transacao {
  id: string;
  userId: string;
  tipo: "gasto" | "receita";
  valorCentavos: number;
  categoria: string;
  descricao: string;
  data: string;
}

export interface Tarefa {
  id: string;
  userId: string;
  titulo: string;
  descricao?: string;
  dataVencimento?: string;
  status: "pendente" | "concluida";
}

export interface Lembrete {
  id: string;
  userId: string;
  titulo: string;
  dataHora: string;
}

export interface PerfilUsuario {
  userId: string;
  nome: string;
  tipoNegocio?: "MEI" | "PJ" | "autonomo";
}

const transacoes: Transacao[] = [];
const tarefas: Tarefa[] = [];
const lembretes: Lembrete[] = [];
const perfis = new Map<string, PerfilUsuario>();

let seq = 0;
const nextId = () => String(++seq);

export const db = {
  salvarTransacao(t: Omit<Transacao, "id">): Transacao {
    const row = { ...t, id: nextId() };
    transacoes.push(row);
    return row;
  },
  resumoTransacoes(userId: string, desde: Date) {
    return transacoes.filter(
      (t) => t.userId === userId && new Date(t.data) >= desde,
    );
  },
  criarTarefa(t: Omit<Tarefa, "id" | "status">): Tarefa {
    const row: Tarefa = { ...t, id: nextId(), status: "pendente" };
    tarefas.push(row);
    return row;
  },
  listarTarefas(userId: string, status?: Tarefa["status"]): Tarefa[] {
    return tarefas.filter(
      (t) => t.userId === userId && (!status || t.status === status),
    );
  },
  concluirTarefa(userId: string, tarefaId: string): Tarefa | undefined {
    const row = tarefas.find((t) => t.id === tarefaId && t.userId === userId);
    if (row) row.status = "concluida";
    return row;
  },
  criarLembrete(l: Omit<Lembrete, "id">): Lembrete {
    const row = { ...l, id: nextId() };
    lembretes.push(row);
    return row;
  },
  salvarPerfil(p: PerfilUsuario): PerfilUsuario {
    perfis.set(p.userId, p);
    return p;
  },
};
