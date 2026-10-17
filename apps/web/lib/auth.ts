import { cookies } from 'next/headers';
import { getAccountForUser, type UserAccount } from '@zapbuddy/db';
import { verifySessionCookieValue, sessionCookieName } from './session';

export async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return verifySessionCookieValue(cookieStore.get(sessionCookieName)?.value);
}

/** Conta (ADR 0002) do usuário logado no dashboard — dado exibido é escopado por conta, não por usuário. */
export async function getCurrentAccount(userId: string): Promise<UserAccount | null> {
  return getAccountForUser(userId);
}
