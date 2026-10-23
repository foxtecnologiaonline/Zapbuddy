import { listNotesMissingEmbedding, setNoteEmbedding, listDocumentsMissingEmbedding, setDocumentEmbedding, logger } from '@zapbuddy/db';
import { embedText, buildDocumentEmbeddingText } from '@zapbuddy/core';

// Pequeno de propósito: roda a cada passada horária do sweep. Com a fila de
// pendentes vazia (o normal) custa duas queries leves por hora; com backlog
// (notas e arquivos anteriores à busca semântica) drena ~25 de cada por hora,
// sem estourar cota de embedding nem segurar o sweep.
const BATCH_SIZE = 25;

/**
 * Completa o vetor de notas e documentos que ficaram sem — criados antes da
 * busca semântica existir, ou quando a chave da OpenAI estava ausente/fora do
 * ar na hora. Sem OPENAI_API_KEY não faz nada (embedText devolve null e o
 * item continua pendente pra próxima passada). Nunca lança: é manutenção.
 */
export async function handleEmbeddingsBackfill(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) return;

  try {
    const notes = await listNotesMissingEmbedding(BATCH_SIZE);
    for (const note of notes) {
      const embedding = await embedText(note.content);
      if (embedding) await setNoteEmbedding(note.id, embedding);
    }

    const documents = await listDocumentsMissingEmbedding(BATCH_SIZE);
    for (const document of documents) {
      const embedding = await embedText(
        buildDocumentEmbeddingText({ fileName: document.file_name, caption: document.caption, extractedText: document.extracted_text }),
      );
      if (embedding) await setDocumentEmbedding(document.id, embedding);
    }
  } catch (error) {
    logger.error('embeddings_backfill_failed', { error: error instanceof Error ? error.message : String(error) });
  }
}
