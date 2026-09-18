'use client'

// ============ سوبر المزاد ⚽ ============
// وضع كلاسيك: ميزانية ٥٠ مليون — ٦ جولات — وضع برو ماكس: ٢٠٠ مليون — ١٢ جولة
// كل جولة: لاعب من مركز مختلف بلا تكرار (GK ثم ST وهكذا)، بداية من ٥ مليون، مؤقت ١٠ ثوانٍ
// الاختيار: ضد الذكاء الاصطناعي أو أونلاين ضد لاعب حقيقي — وفي النهاية محاكاة المباراة
// وبعد النتيجة والإحصائيات زر «متابعة» يعود للصفحة الرئيسة.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Socket } from 'socket.io-client'
import { ALL_CARDS, CARD_BY_ID, marketValue, POINTS } from '@/lib/cards-data'
import type { MatchResult } from '@/lib/match-engine'
import { getSocket } from '@/lib/socket-client'
import { PlayerCard } from './player-card'
import { MatchSim } from './match-sim'
import { Avatar } from './avatar'

interface CardState {
  id: string
  name: string
  rating: number
  pos: string
  gk?: boolean
  nation: string
  club: string
}

const cardOf = (id: string | undefined | null) => (id ? CARD_BY_ID.get(id) || null : null)

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
  roundPos?: string | null
  price: number
  leader: 'me' | 'rival' | null
  deadlineMs: number
  log: { at: number; kind: string; text: string; amount?: number }[]
}

// ===== حالة أونلاين (مجردة عن المقعد) =====
interface OnlineState {
  game: string
  code: string
  mode: 'classic' | 'promax'
  phase: 'waiting' | 'playing' | 'complete' | 'done'
  host: { name: string; telegramId: string | null } | null
  guest: { name: string; telegramId: string | null } | null
  hostSquad: CardState[]
  guestSquad: CardState[]
  hostSpent: number
  guestSpent: number
  budget: number
  round: number
  totalRounds: number
  current: CardState | null
  roundPos?: string | null
  price: number
  leader: 'host' | 'guest' | null
  deadlineMs: number
  log: { at: number; text: string }[]
  match: MatchResult | null
  serverNow: number
}

interface Props {
  tgId: string
  name: string
  mode: 'classic' | 'promax'
  onExit: () => void
  onPoints: (delta: number) => void
}

type Opponent = 'ai' | 'online' | null

export function AuctionGame({ tgId, name, mode, onExit, onPoints }: Props) {
  const [opponent, setOpponent] = useState<Opponent>(null)

  if (!opponent) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#1e1b4b,#09090b_65%)] p-4 text-white">
        <div className="mx-auto max-w-md space-y-4 pt-10">
          <button onClick={onExit} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
            ← رجوع
          </button>
          <div className="pt-4 text-center">
            <div className="text-4xl">⚽</div>
            <div className="mt-2 text-3xl font-black">سوبر المزاد</div>
            <div className="mt-1 text-sm text-zinc-400">{mode === 'promax' ? '💎 برو ماكس — ٢٠٠ مليون · ١٢ جولة' : '⚽ كلاسيك — ٥٠ مليون · ٦ جولات'}</div>
            <div className="mt-1 text-xs text-zinc-500">كل جولة لاعب من مركز مختلف — GK ثم ST وهكذا بلا تكرار</div>
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setOpponent('ai')}
            className="w-full rounded-3xl border border-white/10 bg-gradient-to-l from-amber-500/25 to-orange-500/10 p-6 text-right shadow-lg transition hover:brightness-125"
          >
            <div className="text-4xl">🤖</div>
            <div className="mt-2 text-xl font-black">ضد الذكاء الاصطناعي</div>
            <div className="mt-0.5 text-xs text-zinc-400">زايد ضد مدير رياضي خارق الذكاء — فوراً</div>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setOpponent('online')}
            className="w-full rounded-3xl border border-white/10 bg-gradient-to-l from-emerald-500/25 to-teal-500/10 p-6 text-right shadow-lg transition hover:brightness-125"
          >
            <div className="text-4xl">🌍</div>
            <div className="mt-2 text-xl font-black">أونلاين — لاعب حقيقي</div>
            <div className="mt-0.5 text-xs text-zinc-400">مزايدة سريعة أو غرفة بكود مع صديق</div>
          </motion.button>
        </div>
      </div>
    )
  }

  if (opponent === 'online') {
    return <OnlineAuction tgId={tgId} name={name} mode={mode} onExit={onExit} onPoints={onPoints} onBack={() => setOpponent(null)} />
  }
  return <AiAuction tgId={tgId} name={name} mode={mode} onExit={onExit} onPoints={onPoints} onBack={() => setOpponent(null)} />
}

// ================================================================
// ==================== المزاد ضد الذكاء الاصطناعي ====================
// ================================================================
function AiAuction({ tgId, name, mode, onExit, onPoints, onBack }: Props & { onBack: () => void }) {
  const [state, setState] = useState<AuctionState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(10)
  const [match, setMatch] = useState<MatchResult | null>(null)
  const [pointsEarned, setPointsEarned] = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const finishingRef = useRef(false)

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
        <button onClick={onBack} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold">
          رجوع
        </button>
      </div>
    )
  }

  const myRemaining = state.budget - state.spent
  const iLead = state.leader === 'me'
  const rivalLeads = state.leader === 'rival'
  const card = state.current
  const cardFull = card ? CARD_BY_ID.get(card.id) || null : null

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#1e1b4b,#09090b_65%)] pb-8 text-white">
      <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-5">
        {/* الرأس */}
        <div className="flex items-center justify-between gap-2">
          <button onClick={onBack} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
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
              <div className="mb-1 text-center">
                <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] font-black text-amber-300">مركز الجولة: {state.roundPos || card.pos}</span>
              </div>
              <PlayerCard card={cardFull} size={210} glow />
              <div className="mt-1 text-center text-[11px] text-zinc-400">قيمة السوق التقديرية ≈ {cardFull ? marketValue(cardFull) : '—'}م</div>
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

        {/* شاشة المحاكاة — عند النهاية: الإحصائيات + متابعة → الرئيسة */}
        <AnimatePresence>
          {match && (
            <MatchSim
              match={match}
              homeName={name}
              homeTgId={tgId}
              awayName={`${state.aiPersona.emoji} ${state.rivalName}`}
              homeSquad={state.mySquad.map((c) => c.id)}
              awaySquad={state.rivalSquad.map((c) => c.id)}
              pointsEarned={pointsEarned}
              onClose={onExit}
              closeLabel="متابعة — الصفحة الرئيسة 🏠"
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ================================================================
// ==================== المزاد أونلاين (لاعب حقيقي) ====================
// ================================================================
function OnlineAuction({ tgId, name, mode, onExit, onPoints, onBack }: Props & { onBack: () => void }) {
  const [screen, setScreen] = useState<'lobby' | 'game'>('lobby')
  const [seat, setSeat] = useState<'host' | 'guest' | 'spect' | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [st, setSt] = useState<OnlineState | null>(null)
  const [error, setError] = useState('')
  const [countdown, setCountdown] = useState(10)
  const [pointsEarned, setPointsEarned] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const finishingRef = useRef(false)
  const clockOffsetRef = useRef(0)

  const ensureSocket = useCallback(async (): Promise<Socket> => {
    if (socketRef.current) return socketRef.current
    const s = await getSocket()
    socketRef.current = s
    return s
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const socket = await ensureSocket()
      if (cancelled) return
      const onState = (s: OnlineState) => {
        if (s.game !== 'auction') return
        clockOffsetRef.current = s.serverNow - Date.now()
        setSt(s)
        if (s.phase === 'done' && s.match && !finishingRef.current && seatRef.current !== 'spect') {
          // تسجيل النتيجة مرة واحدة لكل لاعب
          finishingRef.current = true
          const my = seatRef.current === 'host' ? s.match.scoreHome : s.match.scoreAway
          const their = seatRef.current === 'host' ? s.match.scoreAway : s.match.scoreHome
          const result = my > their ? 'win' : my < their ? 'loss' : 'draw'
          const delta = result === 'win' ? POINTS.auctionWin : result === 'loss' ? POINTS.loss : POINTS.draw
          setPointsEarned(delta)
          onPoints(delta)
          if (tgId) {
            void fetch('/api/kingdom/finish', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tgId,
                name,
                game: 'auction',
                mode: s.mode,
                result,
                scoreMe: my,
                scoreRival: their,
                rivalName: (seatRef.current === 'host' ? s.guest?.name : s.host?.name) || 'الخصم',
                mySquad: (seatRef.current === 'host' ? s.hostSquad : s.guestSquad).map((c) => c.id),
                rivalSquad: (seatRef.current === 'host' ? s.guestSquad : s.hostSquad).map((c) => c.id),
              }),
            }).catch(() => {})
          }
        }
      }
      socket.on('cards:state', onState)
      socket.on('cards:closed', () => {
        setError('أُغلقت الغرفة — عودة للقائمة')
        setTimeout(() => onExit(), 1200)
      })
    })()
    return () => {
      cancelled = true
      void (async () => {
        const socket = socketRef.current
        if (!socket) return
        socket.off('cards:state')
      })()
    }
  }, [ensureSocket, tgId, name, onExit, onPoints])

  const seatRef = useRef<'host' | 'guest' | 'spect' | null>(null)
  useEffect(() => {
    seatRef.current = seat
  }, [seat])

  const quickMatch = useCallback(() => {
    void (async () => {
      const socket = await ensureSocket()
      socket.emit('auction:create', { mode, name, telegramId: tgId, quick: true }, (res: { ok: boolean; code: string; seat: 'host' | 'guest' | 'spect' }) => {
        if (res?.ok) {
          setRoomCode(res.code)
          setSeat(res.seat)
          setScreen('game')
        }
      })
    })()
  }, [ensureSocket, mode, name, tgId])

  const createRoom = useCallback(() => {
    void (async () => {
      const socket = await ensureSocket()
      socket.emit('auction:create', { mode, name, telegramId: tgId }, (res: { ok: boolean; code: string; seat: 'host' | 'guest' | 'spect' }) => {
        if (res?.ok) {
          setRoomCode(res.code)
          setSeat(res.seat)
          setScreen('game')
        }
      })
    })()
  }, [ensureSocket, mode, name, tgId])

  const joinRoom = useCallback(
    (code: string) => {
      const clean = code.trim().toUpperCase().slice(0, 4)
      if (clean.length < 4) return
      void (async () => {
        const socket = await ensureSocket()
        socket.emit('auction:join', { code: clean, name, telegramId: tgId }, (res: { ok: boolean; code?: string; seat?: string; error?: string }) => {
          if (res?.ok && res.code) {
            setRoomCode(res.code)
            setSeat((res.seat as 'host' | 'guest' | 'spect') || 'spect')
            setScreen('game')
          } else {
            setError(res?.error || 'تعذر الانضمام')
            setTimeout(() => setError(''), 2500)
          }
        })
      })()
    },
    [ensureSocket, name, tgId],
  )

  const bid = (inc: number) => {
    socketRef.current?.emit('auction:bid', { code: roomCode, inc }, (res: { ok: boolean; error?: string }) => {
      if (res && !res.ok && res.error) {
        setError(res.error)
        setTimeout(() => setError(''), 2500)
      }
    })
  }

  // عدّاد من ساعة الخادم
  useEffect(() => {
    if (st?.phase !== 'playing') return
    const tick = () => setCountdown(Math.max(0, Math.ceil((st.deadlineMs - (Date.now() + clockOffsetRef.current)) / 1000)))
    tick()
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
  }, [st?.deadlineMs, st?.phase])

  // منظور لاعبي من الحالة المطلقة
  const view = useMemo(() => {
    if (!st || !seat || seat === 'spect') return null
    const isHost = seat === 'host'
    return {
      me: isHost ? st.host : st.guest,
      rival: isHost ? st.guest : st.host,
      mySquad: isHost ? st.hostSquad : st.guestSquad,
      rivalSquad: isHost ? st.guestSquad : st.hostSquad,
      mySpent: isHost ? st.hostSpent : st.guestSpent,
      rivalSpent: isHost ? st.guestSpent : st.hostSpent,
      iLead: st.leader === seat,
      rivalLeads: !!st.leader && st.leader !== seat,
    }
  }, [st, seat])

  // ===== واجهة اللوبي =====
  if (screen === 'lobby') {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#1e1b4b,#09090b_65%)] p-4 text-white">
        <div className="mx-auto max-w-md space-y-4 pt-8">
          <button onClick={onBack} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
            ← رجوع
          </button>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center">
            <div className="text-3xl">🌍</div>
            <div className="mt-1 text-xl font-black">المزاد أونلاين</div>
            <div className="mt-1 text-xs text-zinc-400">{mode === 'promax' ? '💎 برو ماكس — ٢٠٠ مليون' : '⚽ كلاسيك — ٥٠ مليون'}</div>
          </div>
          <button onClick={quickMatch} className="w-full rounded-2xl bg-gradient-to-l from-emerald-400 to-teal-500 py-4 text-lg font-black text-black shadow-lg transition hover:brightness-110 active:scale-[.98]">
            ⚡ مباراة سريعة — أي لاعب متاح
          </button>
          <button onClick={createRoom} className="w-full rounded-2xl bg-white/10 py-3.5 font-black transition hover:bg-white/20">
            🔑 إنشاء غرفة ودعوة صديق
          </button>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="mb-2 text-sm font-black text-zinc-300">أو انضم بكود الغرفة</div>
            <div className="flex gap-2">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
                placeholder="ABCD"
                className="flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-center font-mono text-lg font-black tracking-widest outline-none focus:border-emerald-400"
              />
              <button onClick={() => joinRoom(joinCode)} disabled={joinCode.length < 4} className="rounded-xl bg-emerald-500 px-5 font-black text-black transition enabled:hover:brightness-110 disabled:opacity-40">
                انضم
              </button>
            </div>
          </div>
          {error && <div className="text-center text-sm font-bold text-rose-400">{error}</div>}
        </div>
      </div>
    )
  }

  if (!st || !seat) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white">
        <div className="animate-pulse text-xl font-black">…جارٍ الاتصال</div>
      </div>
    )
  }

  // ===== مشاهد =====
  const spectating = seat === 'spect'

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#1e1b4b,#09090b_65%)] pb-8 text-white">
      <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-5">
        {/* الرأس */}
        <div className="flex items-center justify-between gap-2">
          <button onClick={onExit} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
            ← خروج
          </button>
          <div className="rounded-2xl bg-white/10 px-3 py-1.5 text-xs font-black">
            غرفة <span className="font-mono text-amber-300">{st.code}</span> · {st.mode === 'promax' ? '💎 برو ماكس' : '⚽ كلاسيك'} · {st.round}/{st.totalRounds}
          </div>
          {!spectating && <div className="text-left text-xs font-bold text-amber-300">💰 {st.budget - view!.mySpent}م</div>}
        </div>

        {/* انتظار الخصم */}
        {st.phase === 'waiting' && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
            <div className="animate-bounce text-5xl">⏳</div>
            <div className="mt-3 text-xl font-black">في انتظار الخصم…</div>
            <div className="mt-4 text-sm text-zinc-400">شارك الكود مع صديقك:</div>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(roomCode || st.code)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
              className="mt-2 rounded-2xl bg-amber-400 px-8 py-3 font-mono text-3xl font-black tracking-[0.3em] text-black transition hover:brightness-110"
            >
              {roomCode || st.code}
            </button>
            <div className="mt-2 text-[11px] text-zinc-500">{copied ? '✅ تم النسخ!' : 'اضغط للنسخ'}</div>
            <button onClick={quickMatch} className="mt-4 rounded-xl bg-white/10 px-4 py-2 text-xs font-bold transition hover:bg-white/20">
              أو ابحث عن لاعب متاح ⚡
            </button>
          </div>
        )}

        {/* اللاعبان */}
        {st.phase !== 'waiting' && (
          <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-2">
              <Avatar telegramId={seat === 'host' ? tgId : st.host?.telegramId} name={view?.me?.name || st.host?.name || ''} size={38} ring="#34d399" />
              <div>
                <div className="text-sm font-bold">{spectating ? st.host?.name : view?.me?.name} {spectating ? '' : '(أنت)'}</div>
                <div className="text-[11px] text-zinc-400">مصروف: {spectating ? st.hostSpent : view!.mySpent}م</div>
              </div>
            </div>
            <div className="text-xs font-black text-zinc-500">VS</div>
            <div className="flex items-center gap-2">
              <div className="text-left">
                <div className="text-sm font-bold">{spectating ? st.guest?.name : view?.rival?.name}</div>
                <div className="text-[11px] text-zinc-400">مصروف: {spectating ? st.guestSpent : view!.rivalSpent}م</div>
              </div>
              <Avatar telegramId={spectating ? st.guest?.telegramId : seat === 'host' ? st.guest?.telegramId : st.host?.telegramId} name={spectating ? st.guest?.name : view?.rival?.name} size={38} ring="#38bdf8" />
            </div>
          </div>
        )}

        {/* منطقة المزاد */}
        {st.phase === 'playing' && st.current && (
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <div className="mx-auto">
              <div className="mb-1 text-center">
                <span className="rounded-full bg-black/50 px-3 py-1 text-[11px] font-black text-amber-300">مركز الجولة: {st.roundPos || st.current.pos}</span>
              </div>
              <PlayerCard card={CARD_BY_ID.get(st.current.id) || null} size={200} glow />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/40 p-4">
                <div>
                  <div className="text-[11px] text-zinc-400">السعر الحالي</div>
                  <motion.div key={st.price} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="text-4xl font-black tabular-nums text-amber-300">
                    {st.price}
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
                  <div className={`absolute inset-0 flex items-center justify-center text-2xl font-black tabular-nums ${countdown <= 3 ? 'animate-pulse text-rose-400' : 'text-white'}`}>{countdown}</div>
                </div>
              </div>

              {!spectating && (
                <>
                  <div className={`rounded-xl p-2.5 text-center text-sm font-black ${view!.iLead ? 'bg-emerald-500/20 text-emerald-300' : view!.rivalLeads ? 'bg-sky-500/20 text-sky-300' : 'bg-white/10 text-zinc-300'}`}>
                    {view!.iLead ? '👑 أنت أعلى مزايد!' : view!.rivalLeads ? `${view!.rival?.name} يتصدر — زايد أو تخسر الكرت!` : '🛒 المزاد مفتوح — زايد الآن!'}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[1, 2, 5, 10].map((inc) => (
                      <button
                        key={inc}
                        disabled={st.budget - view!.mySpent < st.price + inc}
                        onClick={() => bid(inc)}
                        className="rounded-2xl bg-gradient-to-b from-amber-400 to-amber-600 py-3 text-base font-black text-black shadow-lg transition enabled:hover:brightness-110 enabled:active:scale-95 disabled:opacity-30"
                      >
                        +{inc}م
                      </button>
                    ))}
                  </div>
                </>
              )}
              {error && <div className="text-center text-xs font-bold text-rose-400">{error}</div>}

              <div className="h-24 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-2 text-xs" dir="rtl">
                {st.log.slice().reverse().map((l, i) => (
                  <div key={`${l.at}-${i}`} className="text-zinc-300">
                    {l.text}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* التشكيلتان أثناء اللعب */}
        {st.phase === 'playing' && (
          <div className="grid grid-cols-2 gap-3">
            <SquadMini title={`${spectating ? st.host?.name : 'تشكيلتك'} (${(spectating ? st.hostSquad : view!.mySquad).length})`} cards={spectating ? st.hostSquad : view!.mySquad} ring="border-emerald-400/30" />
            <SquadMini title={`${spectating ? st.guest?.name : view!.rival?.name} (${(spectating ? st.guestSquad : view!.rivalSquad).length})`} cards={spectating ? st.guestSquad : view!.rivalSquad} ring="border-sky-400/30" />
          </div>
        )}

        {/* اكتمال التشكيلتين — المباراة بعد 3 ثوانٍ تلقائياً */}
        {st.phase === 'complete' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-center">
              <div className="text-xl font-black text-amber-300">🏁 اكتملت التشكيلتان!</div>
              <div className="mt-1 animate-pulse text-sm text-zinc-300">تبدأ المباراة بعد لحظات… ⚽</div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SquadFull title={`🟢 ${st.host?.name} — قوة ${squadPower(st.hostSquad)}`} cards={st.hostSquad} />
              <SquadFull title={`🔵 ${st.guest?.name} — قوة ${squadPower(st.guestSquad)}`} cards={st.guestSquad} />
            </div>
          </div>
        )}

        {/* المحاكاة */}
        <AnimatePresence>
          {st.match && (
            <MatchSim
              match={st.match}
              homeName={st.host?.name || 'المضيف'}
              homeTgId={st.host?.telegramId}
              awayName={st.guest?.name || 'الخصم'}
              awayTgId={st.guest?.telegramId}
              homeSquad={st.hostSquad.map((c) => c.id)}
              awaySquad={st.guestSquad.map((c) => c.id)}
              pointsEarned={spectating ? null : pointsEarned}
              onClose={onExit}
              closeLabel="متابعة — الصفحة الرئيسة 🏠"
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ===== عناصر مشتركة =====
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
          <PlayerCard key={`${c.id}-${i}`} card={cardOf(c.id)} size={86} />
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
