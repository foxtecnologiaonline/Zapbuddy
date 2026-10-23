import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../client.js';
import { logger } from '../logger.js';
import type { Document } from '../types.js';

const DOCUMENTS_BUCKET = 'documents';

/** Sem `embedding` e sem `search_tsv` de propósito — vetor e tsvector não têm utilidade pra quem lê e inflariam toda resposta (ver NOTE_COLUMNS em notes.ts). */
const DOCUMENT_COLUMNS =
  'id, account_id, uploaded_by_user_id, storage_path, file_name, mime_type, caption, extracted_text, extracted_data, created_at';

export interface UploadDocumentInput {
  accountId: string;
  uploadedByUserId: string;
  fileName: string;
  mimeType: string;
  caption?: string;
  buffer: Buffer;
}

/**
 * Grava o arquivo no Storage e o registro em `documents` juntos. Se o
 * registro no banco falhar depois do upload, o arquivo órfão no bucket é um
 * custo aceitável (storage é barato) — o inverso (registro sem arquivo)
 * seria pior, por isso a ordem é upload primeiro.
 */
export async function uploadDocument(input: UploadDocumentInput): Promise<Document> {
  const client = getSupabaseClient();
  // Nome vem do remetente do WhatsApp: nunca entra cru na chave do Storage (path traversal).
  const safeName = input.fileName.replace(/[^\w.\-]+/g, '_').replace(/\.{2,}/g, '.').slice(-100) || 'arquivo';
  const storagePath = `${input.accountId}/${randomUUID()}-${safeName}`;

  const { error: uploadError } = await client.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, input.buffer, { contentType: input.mimeType });
  if (uploadError) throw uploadError;

  const { data, error } = await client
    .from('documents')
    .insert({
      account_id: input.accountId,
      uploaded_by_user_id: input.uploadedByUserId,
      storage_path: storagePath,
      file_name: input.fileName,
      mime_type: input.mimeType,
      caption: input.caption ?? null,
    })
    .select(DOCUMENT_COLUMNS)
    .single();

  if (error) throw error;
  return data as Document;
}

const DEFAULT_DOCUMENTS_LIMIT = 20;
const SIGNED_URL_TTL_SECONDS = 60 * 15; // mesma janela dos magic links/convites — consistência de produto

export interface DocumentWithUrl extends Document {
  download_url: string;
}

export async function withSignedUrls(docs: Document[]): Promise<DocumentWithUrl[]> {
  const client = getSupabaseClient();
  return Promise.all(
    docs.map(async (doc) => {
      const { data, error } = await client.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);
      if (error) throw error;
      return { ...doc, download_url: data.signedUrl };
    }),
  );
}

export async function listRecentDocuments(accountId: string, limit = DEFAULT_DOCUMENTS_LIMIT): Promise<DocumentWithUrl[]> {
  const { data, error } = await getSupabaseClient()
    .from('documents')
    .select(DOCUMENT_COLUMNS)
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return withSignedUrls((data ?? []) as Document[]);
}

/**
 * Busca textual por nome do arquivo + legenda + o que o modelo leu no
 * conteúdo (extracted_text, migration 0026) via tsvector do Postgres. A
 * busca por significado é `searchDocumentsBySimilarity`; a tool junta as duas.
 */
export async function searchDocuments(accountId: string, query: string, limit = DEFAULT_DOCUMENTS_LIMIT): Promise<DocumentWithUrl[]> {
  const { data, error } = await getSupabaseClient()
    .from('documents')
    .select(DOCUMENT_COLUMNS)
    .eq('account_id', accountId)
    .textSearch('search_tsv', query, { type: 'websearch', config: 'portuguese' })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return withSignedUrls((data ?? []) as Document[]);
}

export interface RelatedDocument extends Document {
  similarity: number;
}

/** Documentos parecidos em significado com a busca (RPC match_documents). Vazio — nunca erro — se o RPC falhar: é bônus sobre a busca textual. */
export async function searchDocumentsBySimilarity(
  accountId: string,
  embedding: number[],
  limit: number,
  minSimilarity: number,
): Promise<RelatedDocument[]> {
  const { data, error } = await getSupabaseClient().rpc('match_documents', {
    p_account_id: accountId,
    query_embedding: embedding,
    match_count: limit,
    min_similarity: minSimilarity,
  });

  if (error) {
    logger.error('documents_similarity_search_failed', { error });
    return [];
  }
  return (data ?? []) as RelatedDocument[];
}

export interface DocumentAnalysisInput {
  extractedText: string;
  extractedData: Record<string, unknown>;
  embedding: number[] | null;
}

/** Grava o que foi lido do arquivo (e o vetor, quando deu pra gerar). */
export async function saveDocumentAnalysis(documentId: string, input: DocumentAnalysisInput): Promise<void> {
  const { error } = await getSupabaseClient()
    .from('documents')
    .update({ extracted_text: input.extractedText, extracted_data: input.extractedData, embedding: input.embedding })
    .eq('id', documentId);
  if (error) throw error;
}

/** Documentos ainda sem vetor, de qualquer conta — só pro backfill do worker. */
export async function listDocumentsMissingEmbedding(
  limit: number,
): Promise<Array<{ id: string; file_name: string; caption: string | null; extracted_text: string | null }>> {
  const { data, error } = await getSupabaseClient()
    .from('documents')
    .select('id, file_name, caption, extracted_text')
    .is('embedding', null)
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; file_name: string; caption: string | null; extracted_text: string | null }>;
}

export async function setDocumentEmbedding(documentId: string, embedding: number[]): Promise<void> {
  const { error } = await getSupabaseClient().from('documents').update({ embedding }).eq('id', documentId);
  if (error) throw error;
}
