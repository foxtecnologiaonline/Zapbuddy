import { describe, expect, it } from 'vitest';
import { isPrivateAddress, isSafeWebhookUrlSyntax } from './ssrf-guard.js';

describe('ssrf-guard', () => {
  it.each([
    'http://example.com/hook',
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://169.254.169.254/latest/meta-data',
    'https://10.0.0.5/x',
    'https://192.168.1.1/x',
    'https://[::1]/x',
    'https://[::ffff:10.0.0.1]/x',
    'https://user:pass@example.com/x',
    'https://intranet/x',
    'https://db.internal/x',
    'not a url',
  ])('rejeita %s', (url) => {
    expect(isSafeWebhookUrlSyntax(url)).toBe(false);
  });

  it('aceita https público', () => {
    expect(isSafeWebhookUrlSyntax('https://hooks.example.com/zapbuddy')).toBe(true);
    expect(isSafeWebhookUrlSyntax('https://8.8.8.8/x')).toBe(true);
  });

  it('classifica faixas privadas', () => {
    expect(isPrivateAddress('172.16.0.1')).toBe(true);
    expect(isPrivateAddress('172.32.0.1')).toBe(false);
    expect(isPrivateAddress('fd00::1')).toBe(true);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });
});
