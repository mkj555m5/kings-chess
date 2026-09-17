'use client'

// القائمة الرئيسية: اختيار نمط اللعب + الإحصائيات + الإعدادات
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Trophy, Bot, Zap, DoorOpen, KeyRound, Users, Volume2, VolumeX, BarChart3, Crown, LogOut } from 'lucide-react'
import type { AIGameConfig } from './ai-game'
import type { OnlineGameConfig } from './online-game'
import type { Difficulty, TimeControl } from '@/lib/game-types'
import { TIME_CONTROL_LABEL } from '@/lib/game-types'
import type { LocalStats } from '@/lib/local-stats'
import type { TelegramSession } from '@/lib/telegram-session'
import { cn } from '@/lib/utils'
import { Piece, TelegramAvatar } from './pieces'
import { Slider } from '@/components/ui/slider'

interface GlobalStats {
  totals: { games: number; aiWins: number; aiLosses: number; onlineWins: number; draws: number }
  topPlayers: { playerName: string; wins: number }[]
}

export function MenuScreen({
  playerName,
  onPlayerNameChange,
  soundOn,
  onToggleSound,
  volume = 0.6,
  onVolumeChange,
  tgUser,
  onTelegramLogout,
  localStats,
  onStartAI,
  onStartOnline,
  onStartLocal,
  onOpenStats,
}: {
  playerName: string
  onPlayerNameChange: (n: string) => void
  soundOn: boolean
  onToggleSound: () => void
  volume?: number
  onVolumeChange?: (v: number) => void
  tgUser?: TelegramSession | null
  onTelegramLogout?: () => void
  localStats: LocalStats
  onStartAI: (config: AIGameConfig) => void
  onStartOnline: (config: OnlineGameConfig) => void
  onStartLocal: () => void
  onOpenStats: () => void
}) {
  const [aiOpen, setAiOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [colorChoice, setColorChoice] = useState<'white' | 'black' | 'random'>('white')
  const [timeControl, setTimeControl] = useState<TimeControl>('none')
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null)

  useEffect(() => {
    void fetch('/api/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setGlobalStats(d))
      .catch(() => {})
  }, [])

  const winRate = localStats.gamesPlayed > 0 ? Math.round((localStats.wins / localStats.gamesPlayed) * 100) : 0

  const startQuick = () => onStartOnline({ playerName: playerName || 'لاعب', timeControl, flow: 'quick' })
  const startCreate = () => onStartOnline({ playerName: playerName || 'لاعب', timeControl, flow: 'create' })
  const startJoin = () => {
    const code = joinCode.trim().toUpperCase()
    if (code.length < 3) return
    onStartOnline({ playerName: playerName || 'لاعب', timeControl, flow: 'join', joinCode: code })
    setJoinOpen(false)
  }
  const startAI = () => {
    const color = colorChoice === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : colorChoice
    onStartAI({ mode: 'ai', difficulty, playerColor: color, timeControl, playerName: playerName || 'اللاعب' })
    setAiOpen(false)
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-6" dir="rtl">
      {/* الترويسة */}
      <div className="relative mb-8 overflow-hidden rounded-3xl border border-amber-900/40 bg-gradient-to-l from-stone-900 via-stone-900/80 to-stone-950 p-8 text-center shadow-2xl">
        <div className="pointer-events-none absolute -left-8 -top-10 rotate-12 text-[130px] leading-none text-amber-500/10" dir="ltr">♛</div>
        <div className="pointer-events-none absolute -bottom-12 -right-6 -rotate-12 text-[130px] leading-none text-amber-500/10" dir="ltr">♚</div>
        <div className="relative">
          <div className="mb-3 flex items-center justify-center gap-2">
            <span className="text-amber-400"><Crown size={28} /></span>
            <h1 className="bg-gradient-to-l from-amber-200 via-amber-400 to-yellow-200 bg-clip-text text-4xl font-extrabold text-transparent sm:text-5xl">
              شطرنج الملوك
            </h1>
            <span className="text-amber-400"><Crown size={28} /></span>
          </div>
          <p className="text-sm text-stone-400 sm:text-base">
            لعبة شطرنج كاملة القوانين — تحدَّ الوزير الذكي بالتعليقات الساخرة، أو الاعب ضد أصدقائك أونلاين
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleSound}
              className="border-stone-700 bg-stone-900/70 text-stone-300 hover:bg-stone-800"
            >
              {soundOn ? <Volume2 size={15} className="ml-1.5" /> : <VolumeX size={15} className="ml-1.5" />}
              {soundOn ? 'الصوت مفعّل' : 'الصوت مكتوم'}
            </Button>
            {onVolumeChange && (
              <div
                className="flex items-center gap-2 rounded-md border border-stone-700 bg-stone-900/70 px-3 h-8"
                dir="ltr"
                title="مستوى الصوت"
              >
                <Volume2 size={13} className="shrink-0 text-amber-400/80" />
                <Slider
                  value={[Math.round(volume * 100)]}
                  max={100}
                  step={5}
                  onValueChange={(vals) => onVolumeChange((vals[0] ?? 60) / 100)}
                  className="w-24"
                />
                <span className="w-8 text-center text-[11px] font-semibold text-stone-400 tabular-nums">{Math.round(volume * 100)}%</span>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenStats}
              className="border-stone-700 bg-stone-900/70 text-stone-300 hover:bg-stone-800"
            >
              <BarChart3 size={15} className="ml-1.5" />
              الإحصائيات الكاملة
            </Button>
          </div>
        </div>
      </div>

      {/* اسم اللاعب */}
      <div className="mb-6 flex flex-col items-center justify-between gap-3 rounded-2xl border border-stone-800 bg-stone-900/60 p-4 sm:flex-row">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="h-10 w-10 shrink-0 rounded-lg border border-stone-700 bg-stone-800 p-1.5">
            <Piece type="n" color="w" />
          </div>
          <div className="flex-1 sm:w-64">
            <Label className="mb-1 block text-xs text-stone-400">اسمك في اللعبة</Label>
            <Input
              value={playerName}
              onChange={(e) => onPlayerNameChange(e.target.value.slice(0, 20))}
              placeholder="أدخل اسمك…"
              className="h-9 border-stone-700 bg-stone-800/70 text-sm"
            />
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-4 text-center">
            <div>
              <div className="text-2xl font-extrabold text-emerald-400">{localStats.wins}</div>
              <div className="text-[11px] text-stone-500">فوز</div>
            </div>
            <div className="h-8 w-px bg-stone-800" />
            <div>
              <div className="text-2xl font-extrabold text-red-400">{localStats.losses}</div>
              <div className="text-[11px] text-stone-500">خسارة</div>
            </div>
            <div className="h-8 w-px bg-stone-800" />
            <div>
              <div className="text-2xl font-extrabold text-amber-300">{winRate}%</div>
              <div className="text-[11px] text-stone-500">نسبة الفوز</div>
            </div>
          </div>
          {tgUser && (
            <div className="flex items-center gap-2 rounded-full border border-sky-600/40 bg-sky-950/50 py-1 pl-1.5 pr-3">
              <span className="relative flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-sky-700 border border-sky-500/50">
                <TelegramAvatar telegramId={tgUser.telegramId} color="w" pieceType="k" />
              </span>
              <span className="text-xs font-semibold text-sky-300">متصل عبر تلجرام: {tgUser.name}</span>
              {onTelegramLogout && (
                <button
                  onClick={onTelegramLogout}
                  title="تسجيل الخروج من تلجرام"
                  className="text-sky-400/70 transition-colors hover:text-red-400"
                >
                  <LogOut size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* أنماط اللعب */}
      <div className="grid gap-4 sm:grid-cols-2">
        <ModeCard
          icon={<Bot size={26} />}
          title="لعب ضد الوزير"
          desc="ذكاء اصطناعي حقيقي يلعب ويعلّق على نقلاته ونقلاتك بالعربية"
          gradient="from-amber-600/20 to-amber-900/10"
          border="hover:border-amber-500/70"
          onClick={() => setAiOpen(true)}
        />
        <ModeCard
          icon={<Zap size={26} />}
          title="مباراة سريعة أونلاين"
          desc="مواجهة فورية ضد لاعب حقيقي عبر الإنترنت"
          gradient="from-emerald-600/15 to-emerald-900/10"
          border="hover:border-emerald-500/70"
          onClick={startQuick}
        />
        <ModeCard
          icon={<DoorOpen size={26} />}
          title="إنشاء غرفة خاصة"
          desc="أنشئ غرفة وشارك الكود مع صديقك للعب معاً"
          gradient="from-stone-500/10 to-stone-800/20"
          border="hover:border-stone-400/60"
          onClick={startCreate}
        />
        <ModeCard
          icon={<KeyRound size={26} />}
          title="الانضمام بكود"
          desc="ادخل كود الغرفة للانضمام لمباراة صديقك"
          gradient="from-stone-500/10 to-stone-800/20"
          border="hover:border-stone-400/60"
          onClick={() => setJoinOpen(true)}
        />
        <ModeCard
          icon={<Users size={26} />}
          title="لعب محلي - لاعبان"
          desc="تناوبا اللعب على نفس الجهاز، بلا إنترنت"
          gradient="from-purple-600/10 to-stone-900/20"
          border="hover:border-purple-400/50"
          onClick={onStartLocal}
          wide
        />
      </div>

      {/* التحكم بالوقت */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-stone-800 bg-stone-900/60 p-4">
        <span className="text-sm font-bold text-stone-300">ضبط الوقت:</span>
        {(Object.keys(TIME_CONTROL_LABEL) as TimeControl[]).map((tc) => (
          <button
            key={tc}
            onClick={() => setTimeControl(tc)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all',
              timeControl === tc
                ? 'border-amber-500 bg-amber-500/15 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,.2)]'
                : 'border-stone-700 text-stone-400 hover:border-stone-500 hover:text-stone-200',
            )}
          >
            {TIME_CONTROL_LABEL[tc]}
          </button>
        ))}
      </div>

      {/* لوحة المتصدرين */}
      {globalStats && globalStats.topPlayers.length > 0 && (
        <div className="mt-6 rounded-2xl border border-stone-800 bg-stone-900/60 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-amber-300">
            <Trophy size={16} />
            لوحة متصدرين اللعب الأونلاين
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {globalStats.topPlayers.map((p, i) => (
              <div key={p.playerName} className="flex items-center justify-between rounded-lg bg-stone-800/50 px-3 py-1.5">
                <span className="flex items-center gap-2 text-sm text-stone-200">
                  <span className={cn('w-5 text-center text-xs font-bold', i === 0 ? 'text-amber-400' : i === 1 ? 'text-stone-300' : 'text-stone-500')}>
                    {i + 1}
                  </span>
                  {p.playerName}
                </span>
                <span className="text-xs font-bold text-emerald-400">{p.wins} فوز</span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-center text-[11px] text-stone-600">
            إجمالي المباريات المسجلة: {globalStats.totals.games} · انتصارات ضد الوزير: {globalStats.totals.aiWins}
          </div>
        </div>
      )}

      {/* حوار إعداد مباراة الوزير */}
      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-amber-300">مباراة ضد الوزير</DialogTitle>
            <DialogDescription>اضبط مستوى الصعوبة ولونك ووقت المباراة</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div>
              <Label className="mb-2 block text-sm font-bold text-stone-300">مستوى الصعوبة</Label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: 'easy', label: 'مبتدئ', hint: 'للتعلم والاستمتاع' },
                    { key: 'medium', label: 'محترف', hint: 'تحدي متوازن' },
                    { key: 'hard', label: 'أسطورة', hint: 'محرك بعمق 3 — احترس!' },
                  ] as const
                ).map((d) => (
                  <button
                    key={d.key}
                    onClick={() => setDifficulty(d.key as Difficulty)}
                    className={cn(
                      'rounded-xl border p-2.5 text-center transition-all',
                      difficulty === d.key
                        ? 'border-amber-500 bg-amber-500/15 shadow-[0_0_14px_rgba(245,158,11,.2)]'
                        : 'border-stone-700 hover:border-stone-500',
                    )}
                  >
                    <div className={cn('text-sm font-bold', difficulty === d.key ? 'text-amber-300' : 'text-stone-200')}>{d.label}</div>
                    <div className="mt-0.5 text-[10px] leading-tight text-stone-500">{d.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-bold text-stone-300">لونك</Label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: 'white', label: 'أبيض', glyph: '♔' as const },
                    { key: 'random', label: 'عشوائي', glyph: '⚔' as const },
                    { key: 'black', label: 'أسود', glyph: '♚' as const },
                  ] as const
                ).map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setColorChoice(c.key)}
                    className={cn(
                      'rounded-xl border p-2 text-center transition-all',
                      colorChoice === c.key ? 'border-amber-500 bg-amber-500/15' : 'border-stone-700 hover:border-stone-500',
                    )}
                  >
                    <div className="text-xl" dir="ltr">{c.glyph}</div>
                    <div className={cn('text-xs font-bold', colorChoice === c.key ? 'text-amber-300' : 'text-stone-300')}>{c.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-bold text-stone-300">وقت المباراة</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TIME_CONTROL_LABEL) as TimeControl[]).map((tc) => (
                  <button
                    key={tc}
                    onClick={() => setTimeControl(tc)}
                    className={cn(
                      'rounded-lg border px-3 py-1 text-xs font-semibold transition-all',
                      timeControl === tc ? 'border-amber-500 bg-amber-500/15 text-amber-300' : 'border-stone-700 text-stone-400 hover:text-stone-200',
                    )}
                  >
                    {TIME_CONTROL_LABEL[tc]}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={startAI}
              className="w-full bg-gradient-to-l from-amber-600 to-amber-500 py-2.5 text-base font-extrabold text-stone-950 hover:from-amber-500 hover:to-amber-400"
            >
              ابدأ المعركة!
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* حوار الانضمام بكود */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-amber-300">الانضمام لغرفة</DialogTitle>
            <DialogDescription>أدخل كود الغرفة الذي أرسله لك صديقك</DialogDescription>
          </DialogHeader>
          <Input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
            placeholder="مثال: K7QF2"
            className="h-12 text-center font-mono text-2xl font-bold tracking-[0.3em]"
            dir="ltr"
            onKeyDown={(e) => e.key === 'Enter' && startJoin()}
          />
          <Button onClick={startJoin} className="w-full bg-emerald-600 font-bold hover:bg-emerald-500">
            انضمام للمباراة
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ModeCard({
  icon,
  title,
  desc,
  gradient,
  border,
  onClick,
  wide,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  gradient: string
  border: string
  onClick: () => void
  wide?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex items-center gap-4 rounded-2xl border border-stone-800 bg-gradient-to-l p-5 text-right shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl',
        gradient,
        border,
        wide && 'sm:col-span-2',
      )}
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-stone-700/70 bg-stone-900/70 text-amber-400 transition-transform group-hover:scale-110">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-lg font-extrabold text-stone-100">{title}</div>
        <div className="mt-0.5 text-sm text-stone-400">{desc}</div>
      </div>
      <span className="text-stone-600 transition-transform group-hover:-translate-x-1 group-hover:text-amber-400">←</span>
    </button>
  )
}
