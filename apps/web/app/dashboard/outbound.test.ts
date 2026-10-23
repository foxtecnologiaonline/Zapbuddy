import { describe, expect, it } from 'vitest';
import { describeOutboundReply, describeOutboundStatus } from './outbound.js';

describe('describeOutboundStatus', () => {
  it('traduz o status e explica falhas conhecidas', () => {
    expect(describeOutboundStatus({ status: 'read', failed_reason: null, replies: [] })).toBe('Lida');
    expect(describeOutboundStatus({ status: 'failed', failed_reason: '400 code 131047', replies: [] })).toBe('Falhou — fora da janela de 24h da Meta');
    expect(describeOutboundStatus({ status: 'failed', failed_reason: 'timeout', replies: [] })).toBe('Falhou');
  });
});

describe('describeOutboundReply', () => {
  it('sem resposta', () => {
    expect(describeOutboundReply({ status: 'read', failed_reason: null, replies: [] })).toBe('Sem resposta');
  });
  it('mostra o trecho da última resposta, ou o tipo da mídia', () => {
    const base = { status: 'read', failed_reason: null };
    expect(describeOutboundReply({ ...base, replies: [{ body: 'oi', message_type: 'text' }, { body: 'tudo bem?\n\nbeijos', message_type: 'text' }] })).toBe('Respondeu: tudo bem? beijos');
    expect(describeOutboundReply({ ...base, replies: [{ body: null, message_type: 'audio' }] })).toBe('Respondeu: [audio]');
  });
});
