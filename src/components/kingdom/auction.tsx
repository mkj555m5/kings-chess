'use client'

// ============ سوبر المزاد ⚽ ============
// وضع كلاسيك: ميزانية ٥٠ مليون — ٦ جولات — وضع برو ماكس: ٢٠٠ مليون — ١٢ جولة
// كل جولة: كرت معروض يبدأ من ٥ مليون، مؤقت ١٠ ثوانٍ، من لا يزيد يخسر الكرت
// لخصمه (أو يحصل الطرف الآخر على تعويض أضعف)، وفي النهاية محاكاة المباراة.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ALL_CARDS, marketValue, POINTS } from '@/lib/cards-data'
import type { MatchResult } from '@/lib/match-engine'
import { PlayerCard, MysteryCard } from './player-card'
import { MatchSim } from './match-sim'
import { Avatar } from './avatar'

interface CardState {
  id: string
  name: string
  rating: number
  pos: string
  pac: number
  sho: number
  pas: number
  dri: number
  def: number
  phy: number
  nation: string
  club: string
  league: string
  img?: string
  photo?: string
  alt?: string[]
}

interface AuctionState {
  id: string
  mode: 'classic' | 'promax'
  budget: number
  spent: number
  rivalBudget: number
  rivalSpent: number
  rivalName: string
  aiPersona: { name: string; emoji: string }
  mySquad: CardState[]
  rivalSquad: CardState[]
  round: number
  totalRounds: number
  phase: 'bidding' | 'complete' | 'done'
  current: CardState | null
  price: number
  leader: 'me' | 'rival' | null
  deadlineMs: number
  log: { at: number; kind: string; text: string; amount?: number }[]
}

interface Props {
  tgId: string
  name: string
  mode: 'classic' | 'promax'
  onExit: () => void
  onPoints: (delta: number) => void
}

export function AuctionGame({ tgId, name, mode, onExit, onPoints }: Props) {
  const [state, setState] = useState<AuctionState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(10)
  const [match, setMatch] = useState<MatchResult | null>(null)
  const [showFormations, setShowFormations] = useState(false)
  const [pointsEarned, setPointsEarned] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const finishingRef = useRef(false)

  const myTgId = tgId

  const createGame = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/kingdom/auction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', mode, tgId, name }),
      })
      const data = await res.json()
      if (data.ok) setState(data.state)
      else setError(data.error || 'خطأ غير متوقع')
    } catch {
      setError('تعذر الاتصال بالخادم')
    }
    setBusy(false)
  }, [mode, tgId, name])

  useEffect(() => {
    void createGame()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [createGame])

  // جلب حالة دورية أثناء المزايدة — الخادم يدير AI والمؤقت
  useEffect(() => {
    if (!state || state.phase !== 'bidding') {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    const poll = async () => {
      try {
        const res = await fetch('/api/kingdom/auction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'state', sessionId: state.id, tgId }),
        })
        const data = await res.json()
        if (data.ok) setState(data.state)
      } catch {
        // تجاهل انقطاعات مؤقتة
      }
    }
    pollRef.current = setInterval(poll, 900)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [state?.id, state?.phase, tgId])  

  // عدّاد تنازلي محلي من موعد انتهاء الخادم
  useEffect(() => {
    if (state?.phase !== 'bidding') return
    const tick = () => {
      const left = Math.max(0, Math.ceil((state.deadlineMs - Date.now()) / 1000))
      setCountdown(left)
    }
    tick()
    tickRef.current = setInterval(tick, 250)
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [state?.deadlineMs, state?.phase])

  const bid = async (inc: number) => {
    if (!state || busy || state.phase !== 'bidding') return
    setBusy(true)
    try {
      const res = await fetch('/api/kingdom/auction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bid', sessionId: state.id, inc, tgId }),
      })
      const data = await res.json()
      if (data.ok) setState(data.state)
      else if (data.error) setError(data.error)
    } catch {
      setError('تعذر إرسال المزايدة')
    }
    setBusy(false)
    setTimeout(() => setError(''), 2500)
  }

  // بدء المحاكاة عند اكتمال التشكيلتين
  const startSimulation = async () => {
    if (!state) return
    setBusy(true)
    try {
      const res = await fetch('/api/kingdom/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          home: state.mySquad.map((c) => c.id),
          away: state.rivalSquad.map((c) => c.id),
        }),
      })
      const data = await res.json()
      if (data.ok) setMatch(data.match)
    } catch {
      setError('فشل بدء المحاكاة')
    }
    setBusy(false)
  }

  // تسجيل النتيجة ومنح النقاط
  const recordResult = useCallback(
    async (m: MatchResult) => {
      if (finishingRef.current) return
      finishingRef.current = true
      const result = m.scoreHome > m.scoreAway ? 'win' : m.scoreHome < m.scoreAway ? 'loss' : 'draw'
      const delta = result === 'win' ? POINTS.auctionWin : result === 'loss' ? POINTS.loss : POINTS.draw
      try {
        await fetch('/api/kingdom/finish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tgId,
            name,
            game: 'auction',
            mode,
            result,
            scoreMe: m.scoreHome,
            scoreRival: m.scoreAway,
            rivalName: state?.rivalName || 'الخصم',
            mySquad: state?.mySquad.map((c) => c.id) || [],
            rivalSquad: state?.rivalSquad.map((c) => c.id) || [],
            details: { goals: m.goals },
          }),
        })
      } catch {
        // النتيجة محفوظة محلياً على أي حال
      }
      setPointsEarned(delta)
      onPoints(delta)
    },
    [tgId, name, mode, state, onPoints],
  )

  useEffect(() => {
    if (match && pointsEarned === null && !finishingRef.current) void recordResult(match)
  }, [match, pointsEarned, recordResult])

  if (!state) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 text-white">
        <div className="text-2xl font-black">⚽ جارٍ تجهيز المزاد…</div>
        {error && <div className="text-sm text-rose-400">{error}</div>}
        <button onClick={onExit} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold">
          رجوع
        </button>
      </div>
    )
  }

  const myRemaining = state.budget - state.spent
  const rivalRemaining = state.rivalBudget - state.rivalSpent
  const iLead = state.leader === 'me'
  const rivalLeads = state.leader === 'rival'
  const card = state.current
  const cardFull = card ? ALL_CARDS.find((c) => c.id === card.id) || null : null

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#1e1b4b,#09090b_65%)] pb-8 text-white">
      <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-5">
        {/* الرأس */}
        <div className="flex items-center justify-between gap-2">
          <button onClick={onExit} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
            ← خروج
          </button>
          <div className="rounded-2xl bg-white/10 px-4 py-1.5 text-sm font-black">
            {mode === 'promax' ? '💎 برو ماكس' : '⚽ كلاسيك'} · الجولة {Math.min(state.round, state.totalRounds)}/{state.totalRounds}
          </div>
          <div className="text-left text-xs font-bold text-amber-300">💰 ميزانيتك: {myRemaining}م</div>
        </div>

        {/* اللاعبان */}
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2">
            <Avatar telegramId={tgId} name={name} size={38} ring="#34d399" />
            <div>
              <div className="text-sm font-bold">{name}</div>
              <div className="text-[11px] text-zinc-400">مصروف: {state.spent}م</div>
            </div>
          </div>
          <div className="text-xs font-black text-zinc-500">VS</div>
          <div className="flex items-center gap-2">
            <div className="text-left">
              <div className="text-sm font-bold">
                {state.aiPersona.emoji} {state.rivalName}
              </div>
              <div className="text-[11px] text-zinc-400">مصروف: {state.rivalSpent}م</div>
            </div>
            <Avatar name={state.aiPersona.emoji} size={38} ring="#38bdf8" />
          </div>
        </div>

        {/* منطقة المزاد */}
        {state.phase === 'bidding' && card && (
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <div className="mx-auto">
              <PlayerCard card={cardFull} size={210} glow />
              <div className="mt-1 text-center text-[11px] text-zinc-400">قيمة السوق التقديرية ≈ {marketValue(cardFull!)}م</div>
            </div>

            <div className="space-y-3">
              {/* السعر والمؤقت */}
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 p-4">
                <div>
                  <div className="text-[11px] text-zinc-400">السعر الحالي</div>
                  <motion.div key={state.price} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="text-4xl font-black tabular-nums text-amber-300">
                    {state.price}
                    <span className="text-lg">م</span>
                  </motion.div>
                </div>
                <div className="relative h-20 w-20">
                  <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="#3f3f46" strokeWidth="8" />
                    <circle
                      cx="40"
                      cy="40"
                      r="34"
                      fill="none"
                      stroke={countdown <= 3 ? '#f43f5e' : countdown <= 6 ? '#f59e0b' : '#34d399'}
                      strokeWidth="8"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 34}
                      strokeDashoffset={2 * Math.PI * 34 * (1 - countdown / 10)}
                      className="transition-[stroke-dashoffset] duration-200"
                    />
                  </svg>
                  <div className={`absolute inset-0 flex items-center justify-center text-2xl font-black tabular-nums ${countdown <= 3 ? 'animate-pulse text-rose-400' : 'text-white'}`}>
                    {countdown}
                  </div>
                </div>
              </div>

              {/* من يتصدر */}
              <div className={`rounded-xl p-2.5 text-center text-sm font-black ${iLead ? 'bg-emerald-500/20 text-emerald-300' : rivalLeads ? 'bg-sky-500/20 text-sky-300' : 'bg-white/10 text-zinc-300'}`}>
                {iLead ? '👑 أنت أعلى مزايد — حافظ على تقدمك!' : rivalLeads ? `${state.aiPersona.emoji} ${state.rivalName} يتصدر — زايد أو تخسر الكرت!` : '🛒 المزاد مفتوح — أول من يزايد يتصدر'}
              </div>

              {/* أزرار المزايدة */}
              <div className="grid grid-cols-4 gap-2">
                {[1, 2, 5, 10].map((inc) => (
                  <button
                    key={inc}
                    disabled={busy || myRemaining < state.price + inc}
                    onClick={() => bid(inc)}
                    className="rounded-2xl bg-gradient-to-b from-amber-400 to-amber-600 py-3 text-base font-black text-black shadow-lg transition enabled:hover:brightness-110 enabled:active:scale-95 disabled:opacity-30"
                  >
                    +{inc}م
                  </button>
                ))}
              </div>
              {error && <div className="text-center text-xs font-bold text-rose-400">{error}</div>}

              {/* سجل الأحداث */}
              <div className="h-28 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-2 text-xs" dir="rtl">
                {state.log.slice().reverse().map((l, i) => (
                  <div key={`${l.at}-${i}`} className="text-zinc-300">
                    {l.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* التشكيلتان أثناء اللعب */}
        {state.phase === 'bidding' && (
          <div className="grid grid-cols-2 gap-3">
            <SquadMini title={`تشكيلتك (${state.mySquad.length})`} cards={state.mySquad} ring="border-emerald-400/30" />
            <SquadMini title={`${state.aiPersona.name} (${state.rivalSquad.length})`} cards={state.rivalSquad} ring="border-sky-400/30" />
          </div>
        )}

        {/* اكتمال التشكيلتين */}
        {state.phase === 'complete' && !match && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-center">
              <div className="text-xl font-black text-amber-300">🏁 اكتملت التشكيلتان!</div>
              <div className="mt-1 text-sm text-zinc-300">إليك تشكيلتك وتشكيلة خصمك — استعد للمواجهة</div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SquadFull title={`🟢 ${name} — قوة ${squadPower(state.mySquad)}`} cards={state.mySquad} />
              <SquadFull title={`🔵 ${state.aiPersona.emoji} ${state.rivalName} — قوة ${squadPower(state.rivalSquad)}`} cards={state.rivalSquad} />
            </div>
            <button
              onClick={startSimulation}
              disabled={busy}
              className="w-full rounded-2xl bg-gradient-to-l from-emerald-400 to-teal-500 py-4 text-lg font-black text-black shadow-xl transition hover:brightness-110 active:scale-[.98] disabled:opacity-50"
            >
              {busy ? '…جارٍ التحضير' : '⚽ ابدأ المباراة — المحاكاة!'}
            </button>
          </div>
        )}

        {/* شاشة المحاكاة */}
        <AnimatePresence>
          {match && (
            <MatchSim
              match={match}
              homeName={name}
              homeTgId={tgId}
              awayName={`${state.aiPersona.emoji} ${state.rivalName}`}
              onClose={() => {
                setMatch(null)
                setShowFormations(true)
              }}
            />
          )}
        </AnimatePresence>

        {/* النتيجة النهائية والنقاط */}
        {showFormations && match && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
            <div className="text-3xl font-black">
              {match.scoreHome > match.scoreAway ? '🏆 فوز رائع!' : match.scoreHome < match.scoreAway ? '💔 خسارة' : '🤝 تعادل'}
            </div>
            <div className="text-lg font-black text-white">
              {match.scoreHome} - {match.scoreAway}
            </div>
            <div className="rounded-xl bg-amber-400/15 p-3 text-lg font-black text-amber-300">
              {pointsEarned !== null && `+${pointsEarned} نقطة! 🎉`}
              <div className="mt-1 text-xs font-bold text-zinc-400">
                رصيدك ارتفع — تابع تصنيفك من لوحة المتصدرين
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {state.mySquad.slice(0, 6).map((c) => (
                <PlayerCard key={c.id} card={ALL_CARDS.find((x) => x.id === c.id) || null} size={80} />
              ))}
            </div>
            <button
              onClick={() => {
                finishingRef.current = false
                setMatch(null)
                setShowFormations(false)
                setPointsEarned(null)
                void createGame()
              }}
              className="w-full rounded-2xl bg-white/10 py-3 font-black transition hover:bg-white/20"
            >
              🔄 مزاد جديد
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}

function SquadMini({ title, cards, ring }: { title: string; cards: CardState[]; ring: string }) {
  return (
    <div className={`rounded-2xl border bg-white/5 p-2.5 ${ring}`}>
      <div className="mb-1.5 text-xs font-black text-zinc-300">{title}</div>
      <div className="flex flex-wrap gap-1">
        {cards.slice(-8).map((c, i) => (
          <div key={`${c.id}-${i}`} className="rounded-lg bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-zinc-200">
            {c.name} <span className="text-amber-300">{c.rating}</span>
          </div>
        ))}
        {!cards.length && <div className="text-[10px] text-zinc-500">—</div>}
      </div>
    </div>
  )
}

function SquadFull({ title, cards }: { title: string; cards: CardState[] }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="mb-2 text-center text-sm font-black text-white">{title}</div>
      <div className="flex flex-wrap justify-center gap-2">
        {cards.map((c, i) => (
          <PlayerCard key={`${c.id}-${i}`} card={ALL_CARDS.find((x) => x.id === c.id) || null} size={86} />
        ))}
        {!cards.length && <div className="text-xs text-zinc-500">لا لاعبين بعد</div>}
      </div>
    </div>
  )
}

function squadPower(cards: CardState[]): number {
  if (!cards.length) return 0
  return Math.round(cards.reduce((s, c) => s + c.rating, 0) / cards.length)
}
