'use client';

import type { LucideIcon } from 'lucide-react';

/** Plain placeholder card for a dock item whose screen isn't built yet, or one the admin hasn't opened (`message`). */
export default function ComingSoon({ icon: Icon, title, message = 'ส่วนนี้กำลังพัฒนา จะเปิดให้ใช้เร็ว ๆ นี้' }: { icon: LucideIcon; title: string; message?: string }) {
  return (
    <section className="rounded-2xl bg-surface p-8 text-center shadow-neu-lg">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl text-red-600 shadow-neu-in-sm dark:text-red-400">
        <Icon size={26} />
      </span>
      <h1 className="mt-4 text-xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </section>
  );
}
