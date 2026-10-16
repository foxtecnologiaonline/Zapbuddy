import { cookies } from 'next/headers';
import { adminSessionCookieName, isAdminSessionCookieValid } from './admin-session';

export async function isAdminRequest(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminSessionCookieValid(cookieStore.get(adminSessionCookieName)?.value);
}
