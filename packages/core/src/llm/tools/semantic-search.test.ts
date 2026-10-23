import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  listNotes: vi.fn(),
  searchNotesBySimilarity: vi.fn(),
  listRecentDocuments: vi.fn(),
  searchDocuments: vi.fn(),
  searchDocumentsBySimilarity: vi.fn(),
  withSignedUrls: vi.fn(),
}));
const embeddings = vi.hoisted(() => ({ embedText: vi.fn() }));

vi.mock('@zapbuddy/db', () => db);
vi.mock('../embeddings/client.js', () => embeddings);

import { createNoteTool, listNotesTool, updateNoteTool } from './notes.js';
import { findDocumentTool } from './documents.js';

const ctx = { userId: 'user-1', accountId: 'account-1' } as never;
const NOTE_ID = '11111111-1111-4111-8111-111111111111';

describe('notas com busca semântica', () => {
  beforeEach(() => vi.clearAllMocks());

  it('create_note grava o vetor quando há, e salva mesmo sem (sem chave da OpenAI)', async () => {
    db.createNote.mockResolvedValue({ id: 'n1' });
    embeddings.embedText.mockResolvedValueOnce([0.1, 0.2]).mockResolvedValueOnce(null);

    await createNoteTool.execute({ content: 'pagar aluguel dia 5' }, ctx);
    expect(db.createNote).toHaveBeenLastCalledWith('account-1', 'user-1', 'pagar aluguel dia 5', [0.1, 0.2]);

    await createNoteTool.execute({ content: 'outra' }, ctx);
    expect(db.createNote).toHaveBeenLastCalledWith('account-1', 'user-1', 'outra', null);
  });

  it('update_note regrava o vetor junto com o texto', async () => {
    db.updateNote.mockResolvedValue({ id: NOTE_ID });
    embeddings.embedText.mockResolvedValue(null);
    await updateNoteTool.execute({ note_id: NOTE_ID, content: 'novo' }, ctx);
    expect(db.updateNote).toHaveBeenCalledWith('account-1', NOTE_ID, 'novo', null);
  });

  it('list_notes sem query não gasta embedding', async () => {
    db.listNotes.mockResolvedValue([]);
    await listNotesTool.execute({}, ctx);
    expect(embeddings.embedText).not.toHaveBeenCalled();
    expect(db.searchNotesBySimilarity).not.toHaveBeenCalled();
  });

  it('list_notes com query junta exatos e parecidos, marcando o tipo de cada um', async () => {
    db.listNotes.mockResolvedValue([{ id: 'a', content: 'aluguel dia 5', created_at: 't1' }]);
    embeddings.embedText.mockResolvedValue([0.5]);
    db.searchNotesBySimilarity.mockResolvedValue([
      { id: 'a', content: 'aluguel dia 5', created_at: 't1', similarity: 0.9 },
      { id: 'b', content: 'contrato do apartamento', created_at: 't2', similarity: 0.5 },
    ]);

    const result = (await listNotesTool.execute({ query: 'aluguel' }, ctx)) as { notes: Array<{ id: string; match: string }> };

    expect(result.notes).toEqual([
      { id: 'a', content: 'aluguel dia 5', created_at: 't1', match: 'exact' },
      { id: 'b', content: 'contrato do apartamento', created_at: 't2', match: 'related' },
    ]);
  });

  it('sem vetor da busca (OpenAI fora), list_notes ainda devolve os exatos', async () => {
    db.listNotes.mockResolvedValue([{ id: 'a', content: 'x', created_at: 't' }]);
    embeddings.embedText.mockResolvedValue(null);
    const result = (await listNotesTool.execute({ query: 'x' }, ctx)) as { notes: unknown[] };
    expect(result.notes).toHaveLength(1);
    expect(db.searchNotesBySimilarity).not.toHaveBeenCalled();
  });
});

describe('find_document com conteúdo lido e busca semântica', () => {
  beforeEach(() => vi.clearAllMocks());

  const exactDoc = {
    id: 'd1',
    file_name: 'cupom.jpg',
    caption: null,
    created_at: 't1',
    download_url: 'https://signed/d1',
    extracted_text: 'Compra no Mercado X',
    extracted_data: { total_cents: 5490 },
  };

  it('devolve o que foi lido junto com o link', async () => {
    db.searchDocuments.mockResolvedValue([exactDoc]);
    embeddings.embedText.mockResolvedValue(null);

    const result = (await findDocumentTool.execute({ query: 'mercado' }, ctx)) as { documents: Array<Record<string, unknown>> };

    expect(result.documents[0]).toMatchObject({ file_name: 'cupom.jpg', summary: 'Compra no Mercado X', extracted: { total_cents: 5490 }, match: 'exact' });
  });

  it('assina só os relacionados que entraram e não repete o exato', async () => {
    db.searchDocuments.mockResolvedValue([exactDoc]);
    embeddings.embedText.mockResolvedValue([0.1]);
    db.searchDocumentsBySimilarity.mockResolvedValue([
      { ...exactDoc, similarity: 0.9 },
      { id: 'd2', file_name: 'luz.pdf', caption: null, created_at: 't2', extracted_text: 'Conta de luz', extracted_data: null, similarity: 0.4 },
    ]);
    db.withSignedUrls.mockImplementation(async (docs: Array<{ id: string }>) => docs.map((doc) => ({ ...doc, download_url: `https://signed/${doc.id}` })));

    const result = (await findDocumentTool.execute({ query: 'conta' }, ctx)) as { documents: Array<Record<string, unknown>> };

    expect(result.documents.map((doc) => [doc.file_name, doc.match])).toEqual([
      ['cupom.jpg', 'exact'],
      ['luz.pdf', 'related'],
    ]);
    expect(result.documents[1]!.download_url).toBe('https://signed/d2');
    expect(db.withSignedUrls).toHaveBeenCalledWith([expect.objectContaining({ id: 'd2' })]);
  });
});
