'use client'

// ============ اللاعب المجهول 🃏 ============
// بطاقة ظاهرة وبطاقة سوداء مجهولة — في دورك تختار واحدة:
// اختيارك يعود لك والكرت الآخر يذهب لخصمك (والعكس) — 6 جولات × كرتين = 12 بطاقة
// ثم محاكاة المباراة نفس سوبر المزاد.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ALL_CARDS, POINTS } from '@/lib/cards-data'
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

interface MysteryState {
  id: string
  round: number
  totalRounds: number
  turn: 'me' | 'rival'
  phase: 'picking' | 'complete' | 'done'
  visible: string | null
  mystery: string | 'hidden' | null
  mySquad: CardState[]
  rivalSquad: CardState[]
  poolCount: number
  log: { at: number; text: string }[]
  aiPersona: { name: string; emoji: string }
}

interface Props {
  tgId: string
  name: string
  onExit: () => void
  onPoints: (delta: number) => void
}

export function MysteryGame({ tgId, name, onExit, onPoints }: Props) {
  const [state, setState] = useState<MysteryState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [match, setMatch] = useState<MatchResult | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [pointsEarned, setPointsEarned] = useState<number | null>(null)
  const [lastPick, setLastPick] = useState<{ mine: boolean; choice: string; picked: string; other: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const finishingRef = useRef(false)

  const createGame = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/kingdom/mystery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', tgId, name }),
      })
      const data = await res.json()
      if (data.ok) setState(data.state)
      else setError(data.error || 'خطأ')
    } catch {
      setError('تعذر الاتصال بالخادم')
    }
    setBusy(false)
  }, [tgId, name])

  useEffect(() => {
    void createGame()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [createGame])

  // polling أثناء picking — يحرك دور الخصم من الخادم
  useEffect(() => {
    if (!state || state.phase !== 'picking') {
      if (pollRef.current) clearInterval(pollRef.current)
      return
    }
    const poll = async () => {
      try {
        const res = await fetch('/api/kingdom/mystery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'state', sessionId: state.id, tgId }),
        })
        const data = await res.json()
        if (data.ok) setState(data.state)
      } catch {
        // تجاهل
      }
    }
    pollRef.current = setInterval(poll, 1000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [state?.id, state?.phase, tgId])  

  const pick = async (choice: 'visible' | 'mystery') => {
    if (!state || busy || state.phase !== 'picking' || state.turn !== 'me') return
    setBusy(true)
    try {
      const res = await fetch('/api/kingdom/mystery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pick', sessionId: state.id, choice, tgId }),
      })
      const data = await res.json()
      if (data.ok) {
        setState(data.state)
        // إظهار ما تم كشفه من الكرت المجهول
        const picked = choice === 'mystery'
        setLastPick({
          mine: true,
          choice: picked ? 'الكرت المجهول' : 'الكرت الظاهر',
          picked: (data.state.mySquad as CardState[]).slice(-1)[0]?.name || '',
          other: (data.state.rivalSquad as CardState[]).slice(-1)[0]?.name || '',
        })
        setTimeout(() => setLastPick(null), 2800)
      }
    } catch {
      setError('تعذر إرسال الاختيار')
    }
    setBusy(false)
  }

  const startSimulation = async () => {
    if (!state) return
    setBusy(true)
    try {
      const res = await fetch('/api/kingdom/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home: state.mySquad.map((c) => c.id), away: state.rivalSquad.map((c) => c.id) }),
      })
      const data = await res.json()
      if (data.ok) setMatch(data.match)
    } catch {
      setError('فشل بدء المحاكاة')
    }
    setBusy(false)
  }

  const recordResult = useCallback(
    async (m: MatchResult) => {
      if (finishingRef.current) return
      finishingRef.current = true
      const result = m.scoreHome > m.scoreAway ? 'win' : m.scoreHome < m.scoreAway ? 'loss' : 'draw'
      const delta = result === 'win' ? POINTS.mysteryWin : result === 'loss' ? POINTS.loss : POINTS.draw
      try {
        await fetch('/api/kingdom/finish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tgId,
            name,
            game: 'mystery',
            mode: '',
            result,
            scoreMe: m.scoreHome,
            scoreRival: m.scoreAway,
            rivalName: state?.aiPersona.name || 'الخصم',
            mySquad: state?.mySquad.map((c) => c.id) || [],
            rivalSquad: state?.rivalSquad.map((c) => c.id) || [],
            details: { goals: m.goals },
          }),
        })
      } catch {
        // النتيجة معروضة محلياً على أي حال
      }
      setPointsEarned(delta)
      onPoints(delta)
    },
    [tgId, name, state, onPoints],
  )

  useEffect(() => {
    if (match && pointsEarned === null && !finishingRef.current) void recordResult(match)
  }, [match, pointsEarned, recordResult])

  if (!state) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950 text-white">
        <div className="text-2xl font-black">🃏 جارٍ خلط الكروت الغامضة…</div>
        {error && <div className="text-sm text-rose-400">{error}</div>}
        <button onClick={onExit} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold">
          رجوع
        </button>
      </div>
    )
  }

  const visibleCard = state.visible ? ALL_CARDS.find((c) => c.id === state.visible) || null : null
  const myTurn = state.turn === 'me' && state.phase === 'picking'

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#2e1065,#09090b_65%)] pb-8 text-white">
      <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-5">
        {/* الرأس */}
        <div className="flex items-center justify-between">
          <button onClick={onExit} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
            ← خروج
          </button>
          <div className="rounded-2xl bg-purple-500/20 px-4 py-1.5 text-sm font-black text-purple-300">
            🃏 الجولة {Math.min(state.round, state.totalRounds)}/{state.totalRounds}
          </div>
          <div className="text-xs font-bold text-zinc-400">متبقي {state.poolCount} كرت</div>
        </div>

        {/* اللاعبان */}
        <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2">
            <Avatar telegramId={tgId} name={name} size={38} ring="#a78bfa" />
            <div className="text-sm font-bold">{name}</div>
          </div>
          <div className="text-xs font-black text-zinc-500">VS</div>
          <div className="flex items-center gap-2">
            <div className="text-left text-sm font-bold">{state.aiPersona.name}</div>
            <Avatar name={state.aiPersona.emoji} size={38} ring="#f472b6" />
          </div>
        </div>

        {/* منطقة الاختيار */}
        {state.phase === 'picking' && (
          <div className="space-y-4">
            <div className={`rounded-2xl p-3 text-center text-base font-black ${myTurn ? 'animate-pulse bg-emerald-500/20 text-emerald-300' : 'bg-sky-500/20 text-sky-300'}`}>
              {myTurn ? '🎭 دورك — اختر: الكرت الظاهر أم المجهول؟' : `⏳ ${state.aiPersona.emoji} ${state.aiPersona.name} يفكر في اختياره…`}
            </div>

            <div className="flex items-end justify-center gap-6">
              {/* الظاهر */}
              <div className="text-center">
                <PlayerCard card={visibleCard} size={170} selected={myTurn} onClick={myTurn ? () => pick('visible') : undefined} />
                <button
                  disabled={!myTurn || busy}
                  onClick={() => pick('visible')}
                  className="mt-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-black transition enabled:hover:bg-white/20 disabled:opacity-40"
                >
                  خذ الظاهر
                </button>
              </div>
              {/* المجهول */}
              <div className="text-center">
                <MysteryCard size={170} selected={myTurn} onClick={myTurn ? () => pick('mystery') : undefined} />
                <button
                  disabled={!myTurn || busy}
                  onClick={() => pick('mystery')}
                  className="mt-2 rounded-xl bg-purple-500/30 px-4 py-2 text-sm font-black text-purple-200 transition enabled:hover:bg-purple-500/50 disabled:opacity-40"
                >
                  جرّب حظك بالمجهول
                </button>
              </div>
            </div>

            <AnimatePresence>
              {lastPick && (
                <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl border border-purple-400/40 bg-purple-500/10 p-3 text-center text-sm font-bold text-purple-200">
                  🎉 اخترت {lastPick.choice} → <b>{lastPick.picked}</b> لك، و<b>{lastPick.other}</b> لخصمك
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* السجل */}
        <div className="h-24 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-2 text-xs" dir="rtl">
          {state.log.slice().reverse().map((l, i) => (
            <div key={`${l.at}-${i}`} className="text-zinc-300">
              {l.text}
            </div>
          ))}
        </div>

        {/* التشكيلتان */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-purple-400/30 bg-white/5 p-2.5">
            <div className="mb-1.5 text-xs font-black text-zinc-300">تشكيلتك ({state.mySquad.length})</div>
            <div className="flex flex-wrap gap-1">
              {state.mySquad.map((c, i) => (
                <div key={`${c.id}-${i}`} className="rounded-lg bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-zinc-200">
                  {c.name} <span className="text-amber-300">{c.rating}</span>
                </div>
              ))}
              {!state.mySquad.length && <div className="text-[10px] text-zinc-500">—</div>}
            </div>
          </div>
          <div className="rounded-2xl border border-pink-400/30 bg-white/5 p-2.5">
            <div className="mb-1.5 text-xs font-black text-zinc-300">{state.aiPersona.name} ({state.rivalSquad.length})</div>
            <div className="flex flex-wrap gap-1">
              {state.rivalSquad.map((c, i) => (
                <div key={`${c.id}-${i}`} className="rounded-lg bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-zinc-200">
                  {c.name} <span className="text-amber-300">{c.rating}</span>
                </div>
              ))}
              {!state.rivalSquad.length && <div className="text-[10px] text-zinc-500">—</div>}
            </div>
          </div>
        </div>

        {/* اكتمال */}
        {state.phase === 'complete' && !match && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-purple-400/30 bg-purple-500/10 p-4 text-center">
              <div className="text-xl font-black text-purple-300">🏁 اكتملت الكروت الـ 12!</div>
              <div className="mt-1 text-sm text-zinc-300">تشكيلتاك جاهزة — حان وقت المواجهة</div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <div className="mb-2 text-center text-sm font-black">🟢 {name}</div>
                <div className="flex flex-wrap justify-center gap-2">
                  {state.mySquad.map((c, i) => (
                    <PlayerCard key={`${c.id}-${i}`} card={ALL_CARDS.find((x) => x.id === c.id) || null} size={80} />
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <div className="mb-2 text-center text-sm font-black">🔵 {state.aiPersona.emoji} {state.aiPersona.name}</div>
                <div className="flex flex-wrap justify-center gap-2">
                  {state.rivalSquad.map((c, i) => (
                    <PlayerCard key={`${c.id}-${i}`} card={ALL_CARDS.find((x) => x.id === c.id) || null} size={80} />
                  ))}
                </div>
              </div>
            </div>
            <button
              onClick={startSimulation}
              disabled={busy}
              className="w-full rounded-2xl bg-gradient-to-l from-purple-400 to-fuchsia-500 py-4 text-lg font-black text-black shadow-xl transition hover:brightness-110 active:scale-[.98] disabled:opacity-50"
            >
              {busy ? '…جارٍ التحضير' : '⚽ ابدأ المباراة!'}
            </button>
          </div>
        )}

        <AnimatePresence>
          {match && (
            <MatchSim
              match={match}
              homeName={name}
              homeTgId={tgId}
              awayName={`${state.aiPersona.emoji} ${state.aiPersona.name}`}
              onClose={() => {
                setMatch(null)
                setShowResult(true)
              }}
            />
          )}
        </AnimatePresence>

        {showResult && match && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
            <div className="text-3xl font-black">
              {match.scoreHome > match.scoreAway ? '🏆 فوز ملكي!' : match.scoreHome < match.scoreAway ? '💔 خسارة قاسية' : '🤝 تعادل'}
            </div>
            <div className="text-lg font-black text-white">
              {match.scoreHome} - {match.scoreAway}
            </div>
            <div className="rounded-xl bg-purple-500/15 p-3 text-lg font-black text-purple-300">
              {pointsEarned !== null && `+${pointsEarned} نقطة! 🎉`}
            </div>
            <button
              onClick={() => {
                finishingRef.current = false
                setMatch(null)
                setShowResult(false)
                setPointsEarned(null)
                void createGame()
              }}
              className="w-full rounded-2xl bg-white/10 py-3 font-black transition hover:bg-white/20"
            >
              🔄 جولة مجهول جديدة
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
