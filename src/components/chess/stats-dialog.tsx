'use client'

// حوار الإحصائيات الكاملة: إحصائياتي المحلية + الإحصائيات العالمية + سجل المباريات
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Trophy, Swords, Handshake, Flame, Target, RefreshCcw } from 'lucide-react'
import type { LocalStats } from '@/lib/local-stats'
import { resetLocalStats } from '@/lib/local-stats'
import { DIFFICULTY_LABEL, type Difficulty } from '@/lib/game-types'
import { cn } from '@/lib/utils'

interface GlobalStats {
  totals: { games: number; aiWins: number; aiLosses: number; onlineWins: number; draws: number }
  topPlayers: { playerName: string; wins: number }[]
}

const MODE_LABEL: Record<string, string> = { ai: 'ضد الوزير', online: 'أونلاين', local: 'محلي' }
const RESULT_LABEL: Record<string, string> = { win: 'فوز', loss: 'خسارة', draw: 'تعادل' }

export function StatsDialog({
  open,
  onOpenChange,
  localStats,
  onLocalStatsChange,
  playerName,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  localStats: LocalStats
  onLocalStatsChange: (s: LocalStats) => void
  playerName: string
}) {
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null)

  useEffect(() => {
    if (!open) return
    void fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setGlobalStats(d))
      .catch(() => {})
  }, [open])

  const winRate = localStats.gamesPlayed > 0 ? Math.round((localStats.wins / localStats.gamesPlayed) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-300">
            <Trophy size={20} />
            الإحصائيات الكاملة
          </DialogTitle>
          <DialogDescription>سجلك الشخصي وإحصائيات المنصة كاملة</DialogDescription>
        </DialogHeader>

        {/* بطاقات ملخص شخصي */}
        <div className="grid grid-cols-4 gap-2">
          <StatBox icon={<Swords size={15} />} value={localStats.gamesPlayed} label="مباريات" color="text-stone-200" />
          <StatBox icon={<Trophy size={15} />} value={localStats.wins} label="فوز" color="text-emerald-400" />
          <StatBox icon={<Handshake size={15} />} value={localStats.draws} label="تعادل" color="text-amber-300" />
          <StatBox icon={<Target size={15} />} value={`${winRate}%`} label="نسبة الفوز" color="text-sky-300" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatBox value={localStats.aiWins} label="انتصارات ضد الوزير" color="text-amber-400" small />
          <StatBox value={localStats.onlineWins} label="انتصارات أونلاين" color="text-emerald-400" small />
          <StatBox
            icon={<Flame size={15} />}
            value={`${localStats.currentStreak} (الأفضل ${localStats.bestStreak})`}
            label="سلسلة انتصارات"
            color="text-orange-400"
            small
          />
        </div>

        {/* سجل المباريات */}
        <div>
          <div className="mb-1.5 text-sm font-bold text-stone-300">آخر المباريات</div>
          <ScrollArea className="h-40 rounded-xl border border-stone-800 bg-stone-900/60 p-2">
            {localStats.history.length === 0 && (
              <div className="pt-8 text-center text-xs text-stone-600">لا مباريات بعد — ابدأ أول معركة!</div>
            )}
            <div className="space-y-1">
              {localStats.history.map((h) => (
                <div key={h.id} className="flex items-center justify-between rounded-lg bg-stone-800/50 px-3 py-1.5 text-xs">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 font-bold',
                        h.result === 'win' ? 'bg-emerald-500/15 text-emerald-400' : h.result === 'loss' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400',
                      )}
                    >
                      {RESULT_LABEL[h.result]}
                    </span>
                    <span className="text-stone-300">{MODE_LABEL[h.mode]}</span>
                    {h.difficulty && <span className="text-stone-500">({DIFFICULTY_LABEL[h.difficulty as Difficulty]})</span>}
                  </span>
                  <span className="text-stone-500">ضد {h.opponent} · {h.moves} نقلة</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* إحصائيات عالمية */}
        {globalStats && (
          <div>
            <div className="mb-1.5 text-sm font-bold text-stone-300">إحصائيات المنصة</div>
            <div className="grid grid-cols-3 gap-2">
              <StatBox value={globalStats.totals.games} label="مباريات مسجلة" color="text-stone-200" small />
              <StatBox value={globalStats.totals.aiWins} label="انتصارات على الوزير" color="text-amber-400" small />
              <StatBox value={globalStats.totals.onlineWins} label="انتصارات أونلاين" color="text-emerald-400" small />
            </div>
            {globalStats.topPlayers.length > 0 && (
              <div className="mt-2 rounded-xl border border-stone-800 bg-stone-900/60 p-2">
                <div className="mb-1 px-1 text-xs font-bold text-amber-300">أفضل لاعبي الأونلاين</div>
                {globalStats.topPlayers.slice(0, 5).map((p, i) => (
                  <div key={p.playerName} className="flex items-center justify-between px-2 py-1 text-xs">
                    <span className="text-stone-300">
                      <span className={cn('ml-2 font-bold', i === 0 ? 'text-amber-400' : 'text-stone-500')}>{i + 1}.</span>
                      {p.playerName}
                    </span>
                    <span className="font-bold text-emerald-400">{p.wins} فوز</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="mx-auto border-stone-700 text-xs text-stone-400 hover:bg-stone-800 hover:text-red-300"
          onClick={() => onLocalStatsChange(resetLocalStats())}
        >
          <RefreshCcw size={13} className="ml-1" />
          تصفير إحصائياتي الشخصية
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function StatBox({
  icon,
  value,
  label,
  color,
  small,
}: {
  icon?: React.ReactNode
  value: string | number
  label: string
  color: string
  small?: boolean
}) {
  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-2.5 text-center">
      <div className={cn('flex items-center justify-center gap-1 font-extrabold', small ? 'text-lg' : 'text-2xl', color)}>
        {icon}
        {value}
      </div>
      <div className="mt-0.5 text-[10px] leading-tight text-stone-500">{label}</div>
    </div>
  )
}
