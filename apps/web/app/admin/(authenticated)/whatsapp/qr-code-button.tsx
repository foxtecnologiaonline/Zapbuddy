'use client';

import { useState } from 'react';

/**
 * Único trecho client-side do admin — necessário porque o QR code tem vida
 * curta (segundos): precisa ser buscado e exibido no clique, não num
 * server component renderizado antes do admin estar com o celular em mãos.
 */
export function QrCodeButton() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleClick(): Promise<void> {
    setLoading(true);
    setError(null);
    setQrCode(null);
    try {
      const response = await fetch('/api/admin/whatsapp/connect', { method: 'POST' });
      const data = (await response.json()) as { base64?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? `Falha ao gerar QR code (HTTP ${response.status})`);
      if (!data.base64) throw new Error('Evolution não retornou QR code — a instância já pode estar conectada.');
      setQrCode(data.base64);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        style={{
          background: 'transparent',
          border: '1px solid #2a3340',
          color: '#9fb0c0',
          borderRadius: 6,
          padding: '8px 14px',
          fontSize: 13,
          cursor: loading ? 'default' : 'pointer',
        }}
      >
        {loading ? 'Gerando...' : 'Gerar QR code'}
      </button>
      {error ? <p style={{ color: '#f87171', fontSize: 13, marginTop: 8 }}>{error}</p> : null}
      {qrCode ? (
        <div style={{ marginTop: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCode} alt="QR code de pareamento do WhatsApp" width={240} height={240} style={{ borderRadius: 8 }} />
          <p style={{ fontSize: 12, opacity: 0.6, marginTop: 8, maxWidth: 280 }}>
            Expira em segundos — já deixe o celular aberto em WhatsApp → Dispositivos conectados → Conectar um dispositivo antes de gerar.
          </p>
        </div>
      ) : null}
    </div>
  );
}
