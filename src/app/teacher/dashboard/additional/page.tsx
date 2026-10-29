'use client';

import ComingSoon from '@/components/ComingSoon';
import { Settings } from 'lucide-react';

export default function AdditionalPage() {
  return (
    <div className="px-4 pb-32 pt-2 text-gray-900 sm:px-6 dark:text-gray-50">
      <div className="mx-auto max-w-3xl">
        <ComingSoon icon={Settings} title="ระบบเพิ่มเติม" />
      </div>
    </div>
  );
}
