import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  findUserById: vi.fn(),
  getAccountForUser: vi.fn(),
  createAccountForUser: vi.fn(),
  redeemAccountInvite: vi.fn(),
  uploadDocument: vi.fn(),
  saveDocumentAnalysis: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const core = vi.hoisted(() => ({
  downloadWhatsappMedia: vi.fn(),
  sendWhatsappTextMessage: vi.fn(),
  orchestrateTurn: vi.fn(),
  getCachedReply: vi.fn(),
  setCachedReply: vi.fn(),
  breakLinesAfterSentences: (text: string) => text,
  embedText: vi.fn(),
  extractDocumentContent: vi.fn(),
  getAnalyzableKind: vi.fn(),
  formatExtractionForConversation: vi.fn(),
  buildExtractedText: vi.fn(),
  buildDocumentEmbeddingText: vi.fn(),
  toStoredExtraction: vi.fn(),
  MESSAGES: { documentReceived: (name: string) => `Salvei "${name}"` },
  INVITE_CODE_MESSAGE_PATTERN: /^\s*entrar\s+(\d{4,8})\s*$/i,
}));

vi.mock('@zapbuddy/db', () => db);
vi.mock('@zapbuddy/core', () => core);

import { handleDocumentUpload } from './document-upload.js';

const job = (overrides: Record<string, unknown> = {}) =>
  ({
    data: {
      userId: 'user-1',
      whatsappNumber: '5511999999999',
      mediaRef: { provider: 'cloud-api', mediaId: 'm1' },
      fileName: 'cupom.jpg',
      caption: undefined,
      waMessageId: 'wa-1',
      ...overrides,
    },
  }) as never;

const onboardedUser = { id: 'user-1', whatsapp_number: '5511999999999', onboarding_completed_at: '2026-10-01T00:00:00Z' };
const extraction = { readable: true, kind: 'receipt' };

describe('handleDocumentUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.findUserById.mockResolvedValue(onboardedUser);
    db.getAccountForUser.mockResolvedValue({ accountId: 'account-1', role: 'owner' });
    db.uploadDocument.mockResolvedValue({ id: 'doc-1' });
    core.getCachedReply.mockResolvedValue(null);
    core.downloadWhatsappMedia.mockResolvedValue({ buffer: Buffer.from('x'), mimeType: 'image/jpeg' });
    core.getAnalyzableKind.mockReturnValue('image');
    core.extractDocumentContent.mockResolvedValue(extraction);
    core.embedText.mockResolvedValue([0.1]);
    core.buildExtractedText.mockReturnValue('Compra no Mercado X');
    core.toStoredExtraction.mockReturnValue({ kind: 'receipt' });
    core.formatExtractionForConversation.mockReturnValue('[Arquivo recebido e já salvo: ...]');
    core.orchestrateTurn.mockResolvedValue({ replyText: 'Vi um comprovante de R$ 54,90, quer que eu lance?' });
  });

  it('lê o arquivo, grava a leitura e responde pelo orquestrador', async () => {
    await handleDocumentUpload(job());

    expect(db.saveDocumentAnalysis).toHaveBeenCalledWith('doc-1', {
      extractedText: 'Compra no Mercado X',
      extractedData: { kind: 'receipt' },
      embedding: [0.1],
    });
    expect(core.orchestrateTurn).toHaveBeenCalledWith({ user: onboardedUser, messageText: '[Arquivo recebido e já salvo: ...]', messageSource: 'text' });
    expect(core.sendWhatsappTextMessage).toHaveBeenCalledWith('5511999999999', 'Vi um comprovante de R$ 54,90, quer que eu lance?');
    expect(core.setCachedReply).toHaveBeenCalledWith('wa-1', 'Vi um comprovante de R$ 54,90, quer que eu lance?');
  });

  it('reentrega com resposta já gerada só reenvia: não baixa, não guarda, não lê de novo', async () => {
    core.getCachedReply.mockResolvedValue('resposta antiga');

    await handleDocumentUpload(job());

    expect(core.sendWhatsappTextMessage).toHaveBeenCalledWith('5511999999999', 'resposta antiga');
    expect(core.downloadWhatsappMedia).not.toHaveBeenCalled();
    expect(db.uploadDocument).not.toHaveBeenCalled();
    expect(core.extractDocumentContent).not.toHaveBeenCalled();
  });

  it('tipo não analisável (ex.: docx) só confirma que salvou, sem chamar visão nem LLM', async () => {
    core.getAnalyzableKind.mockReturnValue(null);

    await handleDocumentUpload(job({ fileName: 'contrato.docx' }));

    expect(db.uploadDocument).toHaveBeenCalled();
    expect(core.extractDocumentContent).not.toHaveBeenCalled();
    expect(core.orchestrateTurn).not.toHaveBeenCalled();
    expect(core.sendWhatsappTextMessage).toHaveBeenCalledWith('5511999999999', 'Salvei "contrato.docx"');
  });

  it('falha na leitura cai na confirmação fixa e NÃO propaga (retry duplicaria o upload)', async () => {
    core.extractDocumentContent.mockRejectedValue(new Error('visão fora'));

    await expect(handleDocumentUpload(job())).resolves.toBeUndefined();

    expect(core.orchestrateTurn).not.toHaveBeenCalled();
    expect(core.sendWhatsappTextMessage).toHaveBeenCalledWith('5511999999999', 'Salvei "cupom.jpg"');
  });

  it('nenhum provedor leu (null) → confirmação fixa', async () => {
    core.extractDocumentContent.mockResolvedValue(null);
    await handleDocumentUpload(job());
    expect(core.sendWhatsappTextMessage).toHaveBeenCalledWith('5511999999999', 'Salvei "cupom.jpg"');
  });

  it('quem não terminou o onboarding fica com a leitura guardada mas sem desviar a conversa', async () => {
    db.findUserById.mockResolvedValue({ ...onboardedUser, onboarding_completed_at: null });

    await handleDocumentUpload(job());

    expect(db.saveDocumentAnalysis).toHaveBeenCalled();
    expect(core.orchestrateTurn).not.toHaveBeenCalled();
    expect(core.sendWhatsappTextMessage).toHaveBeenCalledWith('5511999999999', 'Salvei "cupom.jpg"');
  });

  it('falha do orquestrador depois da leitura também cai na confirmação fixa', async () => {
    core.orchestrateTurn.mockRejectedValue(new Error('llm fora'));
    await handleDocumentUpload(job());
    expect(core.sendWhatsappTextMessage).toHaveBeenCalledWith('5511999999999', 'Salvei "cupom.jpg"');
  });

  it('sem conta, convite na legenda entra na conta de quem convidou (comportamento preservado)', async () => {
    db.getAccountForUser.mockResolvedValue(null);
    db.redeemAccountInvite.mockResolvedValue({ accountId: 'account-9', role: 'member' });
    core.getAnalyzableKind.mockReturnValue(null);

    await handleDocumentUpload(job({ caption: 'entrar 482913' }));

    expect(db.redeemAccountInvite).toHaveBeenCalledWith('482913', 'user-1');
    expect(db.createAccountForUser).not.toHaveBeenCalled();
    expect(db.uploadDocument).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'account-9' }));
  });
});
