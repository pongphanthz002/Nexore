/**
 * Soft-UI loading placeholders, shared by every screen. Shapes sit sunk into the surface
 * (`.skeleton` in globals.css: thin inset shadow, slow breathing, still under reduced motion);
 * cards rise like the real ones. Build a screen's skeleton from these instead of ad-hoc
 * grey boxes, so loading looks the same everywhere.
 */

/** One sunk placeholder shape; size and rounding come from `className` (default: a text line). */
export function Bone({ className = 'h-4 w-full' }: { className?: string }) {
  return <span aria-hidden className={`skeleton block rounded-full ${className}`} />;
}

/** Announces the loading state once for a whole skeleton screen or block. */
export function SkeletonGroup({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** A raised card with a title and text lines, or custom contents. */
export function SkeletonCard({ className = '', lines = 3, children }: { className?: string; lines?: number; children?: React.ReactNode }) {
  return (
    <div aria-hidden className={`rounded-[24px] bg-surface p-5 shadow-neu-lg ${className}`}>
      {children ?? (
        <div className="space-y-3">
          <Bone className="h-5 w-2/5" />
          {Array.from({ length: lines }, (_, i) => (
            <Bone key={i} className={`h-3.5 ${i === lines - 1 ? 'w-3/5' : 'w-full'}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/** List rows (people, sessions): optional round photo, two lines, optional trailing pill. */
export function SkeletonRows({ rows = 5, avatar = true, trailing = false }: { rows?: number; avatar?: boolean; trailing?: boolean }) {
  return (
    <div aria-hidden className="space-y-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl p-3 shadow-neu-in-sm">
          {avatar && <Bone className="h-10 w-10 flex-none" />}
          <span className="flex-1 space-y-2">
            <Bone className={`h-4 ${i % 3 === 1 ? 'w-1/2' : 'w-2/5'}`} />
            <Bone className="h-3 w-1/4" />
          </span>
          {trailing && <Bone className="h-9 w-[72px] flex-none" />}
        </div>
      ))}
    </div>
  );
}
