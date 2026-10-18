import type { Job } from 'bullmq';
import { findUserById } from '@zapbuddy/db';
import { sendWhatsappTextMessage, formatOnboardingNudgeMessage, type OnboardingNudgeJob } from '@zapbuddy/core';

/**
 * Reengajamento de onboarding travado (ADR 0005, sugestão 4) — agendado em
 * incoming-message.ts (2h e 24h depois da primeira mensagem), mas só manda
 * de verdade se a pessoa ainda não terminou o cadastro no momento em que o
 * job roda: revalida aqui porque o agendamento acontece bem antes da
 * execução, e a pessoa pode ter completado nesse meio-tempo.
 */
export async function handleOnboardingNudge(job: Job<OnboardingNudgeJob>): Promise<void> {
  const { userId, whatsappNumber, stage } = job.data;

  const user = await findUserById(userId);
  if (!user || user.onboarding_completed_at) return;

  await sendWhatsappTextMessage(whatsappNumber, formatOnboardingNudgeMessage(stage));
}
