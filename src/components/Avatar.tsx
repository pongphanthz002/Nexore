'use client';

import { useEffect, useState } from 'react';

/**
 * A person's Google profile photo, or the first letter of their name when there is none or it
 * fails to load. Own photo: `googlePhotoURL(user)` (`src/lib/google-photo.ts`). Other people's: the `photoURL` saved on their
 * School DB doc when they sign in (see `resolveAccount` in AuthContext).
 */

const SIZES = {
  sm: 'h-10 w-10 text-base',
  md: 'h-12 w-12 text-lg',
  lg: 'h-16 w-16 text-2xl',
  xl: 'h-20 w-20 text-3xl',
} as const;

/** Thai titles left out of the initial ("นายสมชาย" → "ส"). */
const TITLE = /^(นาย|นางสาว|นาง|ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง|ครู|Mr\.?|Mrs\.?|Ms\.?|Miss)\s*/i;

export function initialOf(name: string | undefined): string {
  return (name || '').replace(TITLE, '').trim().charAt(0).toUpperCase() || '?';
}

interface AvatarProps {
  src?: string | null;
  name?: string;
  size?: keyof typeof SIZES;
  className?: string;
}

export default function Avatar({ src, name, size = 'sm', className = '' }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const box = `flex flex-none items-center justify-center overflow-hidden rounded-full ${SIZES[size]} ${className}`;

  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external Google photo; next/image would need remote config and proxies it
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        onError={() => {
          console.warn('[avatar] Profile photo failed to load:', src);
          setFailed(true);
        }}
        className={`${box} bg-surface object-cover shadow-neu-sm`}
      />
    );
  }
  return (
    <span aria-hidden className={`${box} bg-surface font-semibold text-gray-700 shadow-neu-in-sm dark:text-gray-200`}>
      {initialOf(name)}
    </span>
  );
}
