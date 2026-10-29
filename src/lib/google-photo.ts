import type { User } from 'firebase/auth';

/** The signed-in user's Google photo at a size fit for 2× screens (null when the account has none). */
export function googlePhotoURL(user: User | null | undefined): string | null {
  if (!user) return null;
  const url = user.photoURL || user.providerData.find(p => p.providerId === 'google.com')?.photoURL || null;
  // Google serves "...=s96-c"; ask for 192 px so the photo stays sharp on phones
  return url ? url.replace(/=s\d+(-c)?$/, '=s192-c') : null;
}
