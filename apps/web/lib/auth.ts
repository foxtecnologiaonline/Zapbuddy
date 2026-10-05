import { cookies } from 'next/headers';
import { verifySessionCookieValue, sessionCookieName } from './session';

export async function getCurrentUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return verifySessionCookieValue(cookieStore.get(sessionCookieName)?.value);
}
