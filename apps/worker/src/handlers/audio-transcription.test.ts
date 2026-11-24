import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ findUserById: vi.fn(), logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const core = vi.hoisted(() => ({
  orchestrateTurn: vi.fn(),
  sendWhatsappTextMessage: vi.fn(),
  sendWhatsappTyping: vi.fn(),
  deliverReply: vi.fn(),
  downloadWhatsappMedia: vi.fn(),
  isAccessBlocked: vi.fn(),
  getCachedReply: vi.fn(),
  setCachedReply: vi.fn(),
}));
const transcriber = vi.hoisted(() => ({ transcribe: vi.fn() }));

vi.mock('@zapbuddy/db', () => db);
vi.mock('@zapbuddy/core', async (importOriginal) => ({ ...(await importOriginal<typeof import('@zapbuddy/core')>()), ...core }));
vi.mock('../audio/get-transcriber.js', () => ({ getAudioTranscriber: () => transcriber, AudioTooLongError: class extends Error {} }));

import { handleAudioTranscription } from './audio-transcription.js';

const job = () => ({ data: { userId: 'u1', audioRef: { provider: 'cloud-api', mediaId: 'm1' }, waMessageId: 'wa-1' } }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  db.findUserById.mockResolvedValue({ id: 'u1', whatsapp_number: '5511999990000' });
  core.isAccessBlocked.mockReturnValue(false);
  core.getCachedReply.mockResolvedValue(null);
  core.downloadWhatsappMedia.mockResolvedValue({ buffer: Buffer.from('x'), mimeType: 'audio/ogg' });
  core.orchestrateTurn.mockResolvedValue({ replyText: 'Anotei!' });
  core.sendWhatsappTextMessage.mockResolvedValue(undefined);
  core.deliverReply.mockResolvedValue(undefined);
});

describe('handleAudioTranscription — transcrição inútil', () => {
  it.each(['', '...', 'Legendas pela comunidade Amara.org', '[Música]'])('"%s": pede pra repetir e NÃO chama o Tom (nada de responder a frase que ninguém disse)', async (transcript) => {
    transcriber.transcribe.mockResolvedValue(transcript);

    await handleAudioTranscription(job());

    expect(core.orchestrateTurn).not.toHaveBeenCalled();
    expect(core.sendWhatsappTextMessage).toHaveBeenCalledWith('5511999990000', expect.stringContaining('Não consegui ouvir esse áudio'));
    expect(core.setCachedReply).not.toHaveBeenCalled();
    expect(db.logger.info).toHaveBeenCalledWith('audio_transcript_unusable', expect.objectContaining({ waMessageId: 'wa-1' }));
  });

  it('não é erro: o job conclui sem lançar (nenhuma das 3 tentativas do BullMQ é gasta numa falha que não muda)', async () => {
    transcriber.transcribe.mockResolvedValue('');
    await expect(handleAudioTranscription(job())).resolves.toBeUndefined();
  });

  it('fala de verdade segue o fluxo normal (turnKey = id da mensagem)', async () => {
    transcriber.transcribe.mockResolvedValue('gastei 30 no mercado');

    await handleAudioTranscription(job());

    expect(core.orchestrateTurn).toHaveBeenCalledWith(expect.objectContaining({ messageText: 'gastei 30 no mercado', messageSource: 'audio', turnKey: 'wa-1' }));
    expect(core.deliverReply).toHaveBeenCalled();
  });
});
