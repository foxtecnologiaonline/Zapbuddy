import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  listNotesMissingEmbedding: vi.fn(),
  setNoteEmbedding: vi.fn(),
  listDocumentsMissingEmbedding: vi.fn(),
  setDocumentEmbedding: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const core = vi.hoisted(() => ({
  embedText: vi.fn(),
  buildDocumentEmbeddingText: vi.fn((input: { fileName: string }) => input.fileName),
}));
vi.mock('@zapbuddy/db', () => db);
vi.mock('@zapbuddy/core', () => core);

import { handleEmbeddingsBackfill } from './embeddings-backfill.js';

describe('handleEmbeddingsBackfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'test';
    db.listNotesMissingEmbedding.mockResolvedValue([{ id: 'n1', content: 'aluguel' }]);
    db.listDocumentsMissingEmbedding.mockResolvedValue([{ id: 'd1', file_name: 'luz.pdf', caption: null, extracted_text: null }]);
  });

  it('sem OPENAI_API_KEY não faz nada (nem consulta o banco)', async () => {
    delete process.env.OPENAI_API_KEY;
    await handleEmbeddingsBackfill();
    expect(db.listNotesMissingEmbedding).not.toHaveBeenCalled();
  });

  it('preenche o vetor de notas e documentos pendentes', async () => {
    core.embedText.mockResolvedValue([0.1]);
    await handleEmbeddingsBackfill();
    expect(db.setNoteEmbedding).toHaveBeenCalledWith('n1', [0.1]);
    expect(db.setDocumentEmbedding).toHaveBeenCalledWith('d1', [0.1]);
  });

  it('quando a OpenAI falha (null), deixa o item pendente pra próxima passada', async () => {
    core.embedText.mockResolvedValue(null);
    await handleEmbeddingsBackfill();
    expect(db.setNoteEmbedding).not.toHaveBeenCalled();
    expect(db.setDocumentEmbedding).not.toHaveBeenCalled();
  });

  it('nunca lança: erro de banco vira log', async () => {
    db.listNotesMissingEmbedding.mockRejectedValue(new Error('db fora'));
    await expect(handleEmbeddingsBackfill()).resolves.toBeUndefined();
    expect(db.logger.error).toHaveBeenCalled();
  });
});
