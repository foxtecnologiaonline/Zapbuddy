import { listUsersPendingOnboardingNudge, logger } from '@zapbuddy/db';
import { getLocalHour, isWithinQuietHours, sendWhatsappTextMessage, recordProactiveMessage, formatOnboardingNudgeMessage, type OnboardingNudgeStage } from '@zapbuddy/core';

// Janelas meia-abertas [from, to) em horas desde users.created_at — cada
// usuário cai numa delas uma vez só, já que o sweep horário que chama isto
// roda 1x/hora (2026-10: substitui o delay nativo do BullMQ por usuário —
// ver nota em queues/definitions.ts). A pessoa pode terminar o cadastro
// entre o cadastro e a checagem; revalidado abaixo via
// `onboarding_completed_at IS NULL` na própria query.
// 2º nudge em 20h–21h, e NÃO em 24h–25h como antes: a Cloud API da Meta só aceita texto livre até 24h depois da última
// mensagem DA PESSOA, e quem travou no onboarding não escreveu desde o cadastro. Com 24–25h a janela já tinha fechado e o
// envio era recusado (só aparecia num log): ninguém nunca foi reengajado por esse estágio (auditoria 2026-11).
const NUDGE_WINDOWS: { stage: OnboardingNudgeStage; hoursAgoFrom: number; hoursAgoTo: number }[] = [
  { stage: '2h', hoursAgoFrom: 2, hoursAgoTo: 3 },
  { stage: '20h', hoursAgoFrom: 20, hoursAgoTo: 21 },
];

/**
 * Reengajamento de onboarding travado (ADR 0005, sugestão 4) — chamado de
 * dentro do sweep horário (insights-sweep.ts), não tem fila própria.
 */
export async function handleOnboardingNudge(): Promise<void> {
  for (const window of NUDGE_WINDOWS) {
    const users = await listUsersPendingOnboardingNudge(window.hoursAgoFrom, window.hoursAgoTo);
    const message = formatOnboardingNudgeMessage(window.stage);

    await Promise.all(
      users.map(async (user) => {
        // Reengajamento é a mensagem que mais incomoda quando chega fora de hora: respeita o silêncio, no fuso da pessoa.
        // Se cair nele, esse estágio é pulado (a janela é de 1h, não reagenda); o próximo estágio tenta de novo.
        if (isWithinQuietHours(getLocalHour(user.timezone), user.quiet_hours_start, user.quiet_hours_end)) {
          logger.info('onboarding_nudge_skipped_quiet_hours', { userId: user.id, stage: window.stage });
          return;
        }
        try {
          await sendWhatsappTextMessage(user.whatsapp_number, message);
          await recordProactiveMessage(user.whatsapp_number, message);
        } catch (error) {
          logger.error('onboarding_nudge_send_failed', {
            userId: user.id,
            stage: window.stage,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
  }
}
