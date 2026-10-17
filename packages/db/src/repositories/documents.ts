import { randomUUID } from 'node:crypto';
import { getSupabaseClient } from '../client.js';
import type { Document } from '../types.js';

const DOCUMENTS_BUCKET = 'documents';

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
  const storagePath = `${input.accountId}/${randomUUID()}-${input.fileName}`;

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
    .select('*')
    .single();

  if (error) throw error;
  return data as Document;
}

const DEFAULT_DOCUMENTS_LIMIT = 20;
const SIGNED_URL_TTL_SECONDS = 60 * 15; // mesma janela dos magic links/convites — consistência de produto

export interface DocumentWithUrl extends Document {
  download_url: string;
}

async function withSignedUrls(docs: Document[]): Promise<DocumentWithUrl[]> {
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
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return withSignedUrls((data ?? []) as Document[]);
}

/**
 * Busca por nome do arquivo + legenda via tsvector do Postgres (ver
 * migration 0006 e decisão 2 do ADR 0002) — não por conteúdo do arquivo.
 */
export async function searchDocuments(accountId: string, query: string, limit = DEFAULT_DOCUMENTS_LIMIT): Promise<DocumentWithUrl[]> {
  const { data, error } = await getSupabaseClient()
    .from('documents')
    .select('*')
    .eq('account_id', accountId)
    .textSearch('search_tsv', query, { type: 'websearch', config: 'portuguese' })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return withSignedUrls((data ?? []) as Document[]);
}
