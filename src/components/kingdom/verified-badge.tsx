'use client'

// ============ شارة التوثيق — ستايل واتساب ============
// دائرة زرقاء (أو رمادية) بعلامة صح بيضاء — مثل شارة الحساب الموثق في واتساب
// تظهر بجانب أسماء الحسابات الموثقة عبر تلجرام (والذهبية لمالك المملكة)

export function VerifiedBadge({ size = 15, variant = 'blue', className = '' }: { size?: number; variant?: 'blue' | 'gray' | 'gold'; className?: string }) {
  const fill = variant === 'gray' ? '#9aa5b1' : variant === 'gold' ? '#f5b400' : '#53bdeb'
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`inline-block shrink-0 ${className}`} role="img" aria-label="حساب موثق" style={{ verticalAlign: '-2px' }}>
      <path
        d="M12 1.6l2.3 2.1 3-.5 1.2 2.8 2.8 1.2-.5 3 2.1 2.3-2.1 2.3.5 3-2.8 1.2-1.2 2.8-3-.5-2.3 2.1-2.3-2.1-3 .5-1.2-2.8-2.8-1.2.5-3L1.1 12l2.1-2.3-.5-3 2.8-1.2 1.2-2.8 3 .5z"
        fill={fill}
      />
      <path d="M7.2 12.3l3.1 3.1 6.2-6.4" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// صف اسم + شارة توثيق (يُستخدم في التصنيف والأصدقاء والرسائل)
export function VerifiedName({ name, verified, isOwner, size = 15, className = '' }: { name: string; verified?: boolean; isOwner?: boolean; size?: number; className?: string }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`}>
      <span className="truncate font-bold">{name}</span>
      {isOwner && <span title="مالك المملكة">👑</span>}
      {(verified || isOwner) && <VerifiedBadge size={size} variant={isOwner ? 'gold' : 'blue'} />}
    </span>
  )
}
