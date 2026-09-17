'use client'

// بطاقة اللاعب + الساعة + شريط التقييم
import { CapturedRow, TelegramAvatar } from './pieces'
import { formatClock } from '@/lib/game-utils'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

export function PlayerCard({
  name,
  color, // لون قطع اللاعب
  isTurn,
  capturedPieces, // القطع التي أكلها هذا اللاعب
  materialLead = 0,
  clockMs,
  clockActive,
  isAI = false,
  connected = true,
  thinkBadge,
  avatarTgId, // معرف تلجرام لعرض صورة الملف الشخصي (اختياري)
}: {
  name: string
  color: 'w' | 'b'
  isTurn: boolean
  capturedPieces: string[]
  materialLead?: number
  clockMs: number | null
  clockActive: boolean
  isAI?: boolean
  connected?: boolean
  thinkBadge?: string | null
  avatarTgId?: string | null
}) {
  const low = clockMs !== null && clockMs < 30000

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-all',
        isTurn
          ? 'border-amber-500/70 bg-stone-800/80 shadow-[0_0_18px_rgba(245,158,11,.18)]'
          : 'border-stone-800 bg-stone-900/60',
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="relative h-9 w-9 shrink-0 rounded-lg bg-stone-800 border border-stone-700 flex items-center justify-center overflow-hidden">
          <TelegramAvatar telegramId={avatarTgId} color={color} pieceType="k" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold text-stone-100">{name}</span>
            {isAI && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-600/30">
                AI
              </span>
            )}
            {!connected && (
              <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-bold text-red-400 border border-red-600/30">
                غير متصل
              </span>
            )}
          </div>
          <CapturedRow pieces={capturedPieces} color={color === 'w' ? 'b' : 'w'} diff={materialLead > 0 ? materialLead : 0} />
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        {clockMs !== null && (
          <div
            className={cn(
              'rounded-lg px-3 py-1 font-mono text-lg font-bold tabular-nums transition-colors',
              low ? 'text-red-400' : 'text-stone-100',
              clockActive && !low && 'bg-stone-800 text-amber-300',
            )}
            style={clockActive ? { boxShadow: '0 0 0 1px rgba(245,158,11,.5)' } : undefined}
            dir="ltr"
          >
            {formatClock(clockMs)}
          </div>
        )}
        {thinkBadge && <span className="animate-pulse text-[11px] font-semibold text-amber-400">{thinkBadge}</span>}
      </div>
    </div>
  )
}

export function EvalBar({ evalCp, orientation }: { evalCp: number | null; orientation: 'white' | 'black' }) {
  const whitePct = evalCp === null ? 50 : Math.max(2, Math.min(98, evalToWhitePercentSafe(evalCp)))
  const fromBottom = orientation === 'white' ? whitePct : 100 - whitePct
  return (
    <div className="relative w-3 overflow-hidden rounded-full border border-stone-700 bg-stone-900" style={{ minHeight: '120px' }} title={`تقييم المحرك: ${(evalCp ?? 0) / 100}`}>
      <div
        className="absolute left-0 w-full bg-gradient-to-t from-stone-200 to-stone-100 transition-all duration-700"
        style={{ height: `${fromBottom}%`, bottom: 0 }}
      />
      <div className="absolute left-0 top-1/2 w-full h-px bg-amber-500/70" />
    </div>
  )
}

function evalToWhitePercentSafe(cp: number): number {
  const clamped = Math.max(-1500, Math.min(1500, cp))
  return Math.round(100 * (1 / (1 + Math.pow(10, -clamped / 400))))
}

export function BoardSkeleton({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10">
      <Skeleton className="h-[320px] w-[320px] rounded-2xl bg-stone-800" />
      {label && <p className="animate-pulse text-sm font-semibold text-amber-400">{label}</p>}
    </div>
  )
}
