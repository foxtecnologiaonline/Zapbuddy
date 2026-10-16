export type ClientStatus = 'onboarding' | 'active';

export interface Client {
  id: string;
  whatsappId: string;
  name: string | null;
  status: ClientStatus;
  onboardingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
