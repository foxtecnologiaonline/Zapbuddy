/**
 * Interruptores de produto (2026-10, ordem do dono do produto: "inibir até
 * próxima ordem" o painel web e a cobrança/trial). Ficam DESLIGADOS por padrão
 * de propósito — sem nenhuma variável configurada em lugar nenhum, o produto
 * já roda sem painel e sem cobrança; religar é ligar a variável (`true`) no
 * worker (`deploy/worker/.env`) E na Vercel, e fazer redeploy.
 *
 * - `DASHBOARD_ENABLED`: painel web (login por link, dashboard, exportação,
 *   conexão da agenda por OAuth, chaves de API). Desligado: o Tom não oferece
 *   nem gera link, e o site mostra "painel indisponível".
 * - `BILLING_ENABLED`: trial com bloqueio real, checkout (Asaas), convite de
 *   assinatura e cancelamento. Desligado: ninguém é bloqueado, o Tom não fala
 *   de preço nem de teste, e a conta fica liberada sem cobrança.
 */
export function isDashboardEnabled(): boolean {
  return process.env.DASHBOARD_ENABLED === 'true';
}

export function isBillingEnabled(): boolean {
  return process.env.BILLING_ENABLED === 'true';
}
