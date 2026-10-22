import { listUsersPendingOnboardingNudge, logger } from '@zapbuddy/db';
import { sendWhatsappTextMessage, formatOnboardingNudgeMessage, type OnboardingNudgeStage } from '@zapbuddy/core';

// Janelas meia-abertas [from, to) em horas desde users.created_at — cada
// usuário cai numa delas uma vez só, já que o sweep horário que chama isto
// roda 1x/hora (2026-10: substitui o delay nativo do BullMQ por usuário —
// ver nota em queues/definitions.ts). A pessoa pode terminar o cadastro
// entre o cadastro e a checagem; revalidado abaixo via
// `onboarding_completed_at IS NULL` na própria query.
const NUDGE_WINDOWS: { stage: OnboardingNudgeStage; hoursAgoFrom: number; hoursAgoTo: number }[] = [
  { stage: '2h', hoursAgoFrom: 2, hoursAgoTo: 3 },
  { stage: '24h', hoursAgoFrom: 24, hoursAgoTo: 25 },
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
        try {
          await sendWhatsappTextMessage(user.whatsapp_number, message);
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
