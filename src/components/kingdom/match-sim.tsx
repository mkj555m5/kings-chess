'use client'

// ============ شاشة محاكاة المباراة ============
// شريط تقدم 0→100% (الدقائق 0→90)، عند 50% ينتهي الشوط الأول،
// الأهداف تظهر لحظياً بالهداف والدقيقة، وبعدها الإحصائيات والتشكيلتان.

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { MatchResult } from '@/lib/match-engine'
import { GOAL_TYPE_AR } from '@/lib/match-engine'
import { Avatar } from './avatar'

interface Props {
  match: MatchResult
  homeName: string
  homeTgId?: string | null
  awayName: string
  awayTgId?: string | null
  onClose: () => void
}

const DURATION_MS = 22000 // زمن المحاكاة الكامل

export function MatchSim({ match, homeName, homeTgId, awayName, awayTgId, onClose }: Props) {
  const [minute, setMinute] = useState(0)
  const [phase, setPhase] = useState<'playing' | 'halftime' | 'done'>('playing')
  const [visibleGoals, setVisibleGoals] = useState<MatchResult['goals']>([])
  const [showStats, setShowStats] = useState(false)
  const raf = useRef<number>(0)
  const startRef = useRef<number>(0)
  const goalIdx = useRef(0)

  useEffect(() => {
    startRef.current = performance.now()
    const step = (t: number) => {
      const elapsed = t - startRef.current
      const m = Math.min(90, Math.floor((elapsed / DURATION_MS) * 90))
      setMinute(m)
      // إظهار الأهداف التي دقيقتها وصلت
      const reached = match.goals.filter((g) => g.minute <= m)
      if (reached.length > goalIdx.current) {
        goalIdx.current = reached.length
        setVisibleGoals(reached)
      }
      if (m >= 45 && phase === 'playing' && !showStats) {
        // عند 50% من الشريط: نهاية الشوط الأول
        if (elapsed >= DURATION_MS * 0.47 && elapsed < DURATION_MS * 0.53) {
          setPhase('halftime')
          setTimeout(() => setPhase('playing'), 2200)
        }
      }
      if (m >= 90) {
        setPhase('done')
        setShowStats(true)
        return
      }
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
     
  }, [])

  const progress = Math.round((minute / 90) * 100)
  const score = (team: 'home' | 'away') => match.goals.filter((g) => g.team === team && g.minute <= minute).length

  const statBar = (label: string, home: number, away: number, fmt: (n: number) => string = (n) => String(n)) => {
    const total = home + away || 1
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs font-bold text-zinc-300">
          <span className="w-10 text-right">{fmt(home)}</span>
          <span className="text-zinc-400">{label}</span>
          <span className="w-10 text-left">{fmt(away)}</span>
        </div>
        <div className="flex h-2 overflow-hidden rounded-full bg-zinc-700">
          <div className="bg-emerald-400" style={{ width: `${(home / total) * 100}%` }} />
          <div className="bg-sky-400" style={{ width: `${(away / total) * 100}%` }} />
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_top,#134e4a,#09090b_70%)] p-4"
    >
      <div className="w-full max-w-xl space-y-4 rounded-3xl border border-white/10 bg-black/40 p-4 shadow-2xl backdrop-blur-md sm:p-6">
        {/* الفريقان والنتيجة */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-1 flex-col items-center gap-1.5">
            <Avatar telegramId={homeTgId} name={homeName} size={52} ring="#34d399" />
            <div className="max-w-28 truncate text-center text-sm font-bold text-white">{homeName}</div>
            <div className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-bold text-emerald-300">تقييم {match.teamRatingHome}</div>
          </div>
          <div className="text-center">
            <motion.div
              key={`${match.scoreHome}-${match.scoreAway}-${minute}`}
              className="text-5xl font-black tabular-nums text-white"
              animate={{ scale: [1, 1.18, 1] }}
              transition={{ duration: 0.4 }}
            >
              {score('home')} - {score('away')}
            </motion.div>
            <div className="mt-1 text-xs font-bold text-zinc-400">
              {phase === 'done' ? 'انتهت المباراة' : phase === 'halftime' ? 'الاستراحة' : `الدقيقة ${minute}'`}
            </div>
          </div>
          <div className="flex flex-1 flex-col items-center gap-1.5">
            <Avatar telegramId={awayTgId} name={awayName} size={52} ring="#38bdf8" />
            <div className="max-w-28 truncate text-center text-sm font-bold text-white">{awayName}</div>
            <div className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[11px] font-bold text-sky-300">تقييم {match.teamRatingAway}</div>
          </div>
        </div>

        {/* شريط التقدم */}
        <div>
          <div className="relative h-4 overflow-hidden rounded-full border border-white/10 bg-zinc-800">
            <motion.div
              className="h-full bg-gradient-to-l from-emerald-400 via-lime-300 to-emerald-500"
              style={{ width: `${progress}%` }}
            />
            {/* علامة الشوط الأول (50%) */}
            <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/60" />
          </div>
          <div className="mt-1 flex justify-between text-[10px] font-bold text-zinc-500">
            <span>0%</span>
            <span className="text-white/80">50% — نهاية الشوط الأول</span>
            <span>100%</span>
          </div>
        </div>

        {/* رسالة الشوط الأول */}
        <AnimatePresence>
          {phase === 'halftime' && (
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="rounded-2xl bg-white/10 p-3 text-center text-lg font-black text-white"
            >
              📣 نهاية الشوط الأول — النتيجة {score('home')} - {score('away')}
            </motion.div>
          )}
        </AnimatePresence>

        {/* الأهداف الحية */}
        <div className="min-h-24 space-y-2">
          <AnimatePresence>
            {visibleGoals
              .slice()
              .reverse()
              .slice(0, 4)
              .map((g, i) => (
                <motion.div
                  key={`${g.minute}-${g.scorer}-${i}`}
                  initial={{ x: g.team === 'home' ? -60 : 60, opacity: 0, scale: 0.85 }}
                  animate={{ x: 0, opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20 }}
                  className={`flex items-center gap-2 rounded-xl border p-2 text-sm font-bold ${
                    g.team === 'home' ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100' : 'border-sky-400/40 bg-sky-400/10 text-sky-100'
                  }`}
                >
                  <span className="rounded-lg bg-black/40 px-1.5 py-0.5 text-xs tabular-nums">{g.minute}&apos;</span>
                  <span className="text-lg">{g.team === 'home' ? '🟢' : '🔵'}</span>
                  <span className="flex-1 truncate">
                    ⚽ <b>{g.scorer}</b>
                    {g.assist && <span className="text-xs opacity-75"> (صناعة: {g.assist})</span>}
                    <span className="mx-1 text-[10px] opacity-70">{GOAL_TYPE_AR[g.type]}</span>
                  </span>
                </motion.div>
              ))}
          </AnimatePresence>
          {!visibleGoals.length && phase === 'playing' && minute > 5 && (
            <div className="pt-6 text-center text-sm text-zinc-500">…لحظات حاسمة تمر بدون أهداف</div>
          )}
        </div>

        {/* النتيجة والإحصائيات النهائية */}
        <AnimatePresence>
          {showStats && (
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 text-center text-xl font-black text-white">
                  {match.scoreHome === match.scoreAway ? '🤝 تعادل!' : match.scoreHome > match.scoreAway ? `🏆 ${homeName} يفوز!` : `🏆 ${awayName} يفوز!`}
                </div>
                <div className="space-y-2.5">
                  {statBar('الاستحواذ', match.stats.home.possession, match.stats.away.possession, (n) => `${n}%`)}
                  {statBar('التسديدات', match.stats.home.shots, match.stats.away.shots)}
                  {statBar('على المرمى', match.stats.home.onTarget, match.stats.away.onTarget)}
                  {statBar('التمريرات', match.stats.home.passes, match.stats.away.passes)}
                  {statBar('الركنيات', match.stats.home.corners, match.stats.away.corners)}
                </div>
              </div>

              {/* الهدافون */}
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    ['🟢 ' + homeName, match.scorersHome],
                    ['🔵 ' + awayName, match.scorersAway],
                  ] as const
                ).map(([label, scorers]) => (
                  <div key={label} className="rounded-xl border border-white/10 bg-black/30 p-3">
                    <div className="mb-1 text-xs font-black text-zinc-300">{label}</div>
                    {Object.entries(scorers).length ? (
                      Object.entries(scorers).map(([name, n]) => (
                        <div key={name} className="text-sm font-bold text-white">
                          ⚽ {name} {n > 1 && <span className="text-amber-300">×{n}</span>}
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-zinc-500">—</div>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={onClose}
                className="w-full rounded-2xl bg-gradient-to-l from-amber-400 to-yellow-500 py-3.5 text-lg font-black text-black shadow-lg transition hover:brightness-110 active:scale-[.98]"
              >
                متابعة 👑
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
