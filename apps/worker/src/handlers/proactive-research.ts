import type { Job } from 'bullmq';
import { logger } from '@zapbuddy/db';
import { searchWeb } from '@zapbuddy/core';

/**
 * Temas fixos do nicho (MEI/autônomo/pequeno negócio — ver CLAUDE.md) em vez
 * de algo dinâmico: mantém o job simples e previsível, sem precisar de uma
 * segunda camada de IA só pra decidir o que pesquisar. Ampliar essa lista é
 * o jeito de expandir o repertório do Tom; cada tópico vira uma entrada (ou
 * um cache-hit, se já pesquisado na última semana) em knowledge_entries.
 */
const RESEARCH_TOPICS = [
  'MEI declaração anual obrigações 2026',
  'mudanças recentes no Simples Nacional',
  'organização financeira para autônomo e pequeno negócio',
  'dicas de produtividade para quem trabalha sozinho',
];

/**
 * Job semanal (ver apps/worker/src/scheduled-jobs.ts) — só alimenta
 * knowledge_entries em background, nunca manda mensagem a usuário sozinho.
 * Falha de um tópico não derruba os outros: cada busca já falha de forma
 * controlada dentro de searchWeb/fetchFromTavily (web-search/client.ts).
 */
export async function handleProactiveResearch(_job: Job): Promise<void> {
  for (const topic of RESEARCH_TOPICS) {
    try {
      await searchWeb(topic, { origin: 'proactive_research' });
    } catch (error) {
      logger.error('proactive_research_topic_failed', {
        topic,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
