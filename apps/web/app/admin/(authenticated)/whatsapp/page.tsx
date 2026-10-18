import { checkWhatsappConnection, evolutionConfiguredInstanceName, evolutionGetInstanceStatus } from '@zapbuddy/core';
import { Badge, EmptyState, Section } from '../components';
import { QrCodeButton } from './qr-code-button';

export const dynamic = 'force-dynamic';

interface WhatsappPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function WhatsappPage({ searchParams }: WhatsappPageProps) {
  const { error } = await searchParams;
  const provider = process.env.WHATSAPP_CHANNEL_PROVIDER ?? 'cloud-api';

  if (provider !== 'evolution') {
    return (
      <Section title="WhatsApp — gestão de instância">
        <EmptyState>
          Canal ativo é <strong>Cloud API</strong> (<code>WHATSAPP_CHANNEL_PROVIDER=cloud-api</code>). Essa tela de
          criar/conectar/excluir só se aplica ao canal Evolution — a Cloud API não tem "instância": número e token são
          geridos direto no Meta Business Manager.
        </EmptyState>
      </Section>
    );
  }

  const instanceName = evolutionConfiguredInstanceName();
  const [status, whatsapp] = await Promise.all([evolutionGetInstanceStatus(), checkWhatsappConnection()]);

  return (
    <>
      {error ? (
        <p style={{ color: '#f87171', fontSize: 13, background: '#1a1012', border: '1px solid #3a1f24', borderRadius: 6, padding: '10px 12px', marginBottom: 16 }}>
          {error}
        </p>
      ) : null}
      <Section title="WhatsApp — gestão de instância (Evolution)">
        <table style={{ fontSize: 13, marginBottom: 8 }}>
          <tbody>
            <tr>
              <td style={{ padding: '4px 12px 4px 0', opacity: 0.6 }}>Instância configurada</td>
              <td style={{ padding: '4px 0', fontFamily: 'monospace' }}>{instanceName ?? '—'}</td>
            </tr>
            <tr>
              <td style={{ padding: '4px 12px 4px 0', opacity: 0.6 }}>Existe na Evolution?</td>
              <td style={{ padding: '4px 0' }}>
                <Badge tone={status.exists ? 'ok' : 'bad'}>{status.exists ? 'sim' : 'não'}</Badge>
              </td>
            </tr>
            {status.exists ? (
              <tr>
                <td style={{ padding: '4px 12px 4px 0', opacity: 0.6 }}>Estado da conexão</td>
                <td style={{ padding: '4px 0' }}>
                  <Badge tone={status.state === 'open' ? 'ok' : 'bad'}>{status.state ?? status.detail ?? 'desconhecido'}</Badge>
                </td>
              </tr>
            ) : null}
            {whatsapp.number ? (
              <tr>
                <td style={{ padding: '4px 12px 4px 0', opacity: 0.6 }}>Número conectado</td>
                <td style={{ padding: '4px 0' }}>{whatsapp.number}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <p style={{ fontSize: 12, opacity: 0.5 }}>
          Essa Evolution API é compartilhada com o ZapScript — toda ação aqui opera só na instância{' '}
          <code>{instanceName}</code>, nunca em outra.
        </p>
      </Section>

      {!status.exists ? (
        <Section title="Criar instância">
          <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 12, maxWidth: 480 }}>
            Nenhuma instância <code>{instanceName}</code> existe ainda nessa Evolution. Criar registra o webhook
            apontando pra este deploy e já pede um QR code — depois de criar, use "Gerar QR code" abaixo pra parear.
          </p>
          <form action="/api/admin/whatsapp/create" method="POST">
            <button
              type="submit"
              style={{ background: '#4ade80', color: '#0b0f14', border: 'none', borderRadius: 6, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Criar instância {instanceName}
            </button>
          </form>
        </Section>
      ) : (
        <>
          <Section title="Conectar (QR code)">
            <QrCodeButton />
          </Section>

          <Section title="Excluir instância">
            <p style={{ fontSize: 13, color: '#f87171', marginBottom: 12, maxWidth: 480 }}>
              Apaga a instância <code>{instanceName}</code> na Evolution — o número desconecta e precisa ser pareado
              de novo do zero (novo QR code). Não afeta outras instâncias/clientes na mesma Evolution. Pra confirmar,
              digite exatamente <code>{instanceName}</code> abaixo.
            </p>
            <form action="/api/admin/whatsapp/delete" method="POST" style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                name="confirm"
                placeholder={instanceName}
                required
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid #2a3340', background: '#121821', color: '#e6edf3', fontSize: 13, width: 220 }}
              />
              <button
                type="submit"
                style={{ background: 'transparent', border: '1px solid #f87171', color: '#f87171', borderRadius: 6, padding: '8px 14px', fontSize: 13, cursor: 'pointer' }}
              >
                Excluir instância
              </button>
            </form>
          </Section>
        </>
      )}
    </>
  );
}
