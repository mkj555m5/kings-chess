'use client'

// لوحة متصدرين المملكة — النقاط الكلية من كل الألعاب
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Avatar } from './avatar'
import { VerifiedBadge } from './verified-badge'

interface Row {
  pos: number
  telegramId: string
  displayName: string
  username: string | null
  points: number
  rank: { name: string; color: string; icon: string }
  isOwner: boolean
}

export function Leaderboard({ myTgId }: { myTgId?: string | null }) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/kingdom/leaderboard?limit=30')
        const data = await res.json()
        if (data.ok) setRows(data.top)
      } catch {
        // تجاهل
      }
      setLoading(false)
    })()
  }, [])

  const medal = (p: number) => (p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : `${p}`)

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-amber-400/20 bg-gradient-to-l from-amber-500/10 to-transparent p-4 text-center">
        <div className="text-2xl font-black text-amber-300">🏆 متصدرو المملكة</div>
        <div className="mt-1 text-xs text-zinc-400">اجمع النقاط من كل الألعاب وارتقِ من برونزي إلى ملكي 👑</div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      ) : rows.length ? (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <motion.div
              key={r.telegramId}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`flex items-center gap-3 rounded-2xl border p-3 ${
                r.telegramId === myTgId ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 bg-white/5'
              }`}
            >
              <div className="w-8 text-center text-lg font-black text-zinc-400">{medal(r.pos)}</div>
              <Avatar telegramId={r.telegramId} name={r.displayName} size={42} ring={r.telegramId === myTgId ? '#34d399' : undefined} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-bold text-white">{r.displayName}</span>
                  {r.isOwner && <span title="المالك">👑</span>}
                  <VerifiedBadge size={14} variant={r.isOwner ? 'gold' : 'blue'} />
                </div>
                <div className="text-[11px] font-bold" style={{ color: r.rank.color }}>
                  {r.rank.icon} {r.rank.name}
                </div>
              </div>
              <div className="text-left">
                <div className="text-xl font-black tabular-nums text-amber-300">{r.points}</div>
                <div className="text-[10px] text-zinc-500">نقطة</div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-white/5 p-8 text-center text-sm text-zinc-400">
          لا يوجد لاعبون بعد — كن أول من يصل للمتصدرة! ⚔️
        </div>
      )}
    </div>
  )
}
