'use client'

// أفاتار موحّد: صورة تلجرام إن وُجدت، وإلا حرف أول بلون من الاسم
import { useState } from 'react'

const COLORS = ['#f43f5e', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16', '#f97316']

export function Avatar({
  telegramId,
  name,
  size = 40,
  className = '',
  ring,
}: {
  telegramId?: string | null
  name?: string | null
  size?: number
  className?: string
  ring?: string
}) {
  const [failed, setFailed] = useState(false)
  const initial = (name || '؟').trim().charAt(0).toUpperCase()
  const color = COLORS[((name || 'x').charCodeAt(0) + (name || '').length) % COLORS.length]
  const showImg = telegramId && !failed
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full flex items-center justify-center font-black text-white ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.45,
        background: showImg ? '#27272a' : `linear-gradient(135deg, ${color}, ${color}aa)`,
        boxShadow: ring ? `0 0 0 2px ${ring}, 0 0 8px ${ring}66` : '0 1px 4px #0006',
      }}
      title={name || undefined}
    >
      {showImg ? (
         
        <img
          src={`/api/telegram/avatar?user=${telegramId}`}
          alt={name || 'avatar'}
          width={size}
          height={size}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  )
}
