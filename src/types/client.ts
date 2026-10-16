export type ClientStatus = 'onboarding' | 'active';
export type OnboardingStep = 'new' | 'awaiting_name' | null;

export interface Client {
  id: string;
  whatsappId: string;
  name: string | null;
  status: ClientStatus;
  onboardingStep: OnboardingStep;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
