'use client'

// ============ اللاعب المجهول 🃏 ============
// بطاقة ظاهرة وبطاقة سوداء مجهولة — في دورك تختار واحدة:
// اختيارك يعود لك والكرت الآخر يذهب لخصمك (والعكس) — 6 جولات × كرتين = 12 بطاقة
// كل بطاقة من مركز مختلف بلا تكرار (GK ثم ST وهكذا)
// الاختيار: ضد الذكاء الاصطناعي أو أونلاين ضد لاعب حقيقي
// ثم محاكاة المباراة — وبعد النتيجة والإحصائيات «متابعة» تعود للصفحة الرئيسة.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Socket } from 'socket.io-client'
import { CARD_BY_ID, POINTS } from '@/lib/cards-data'
import type { MatchResult } from '@/lib/match-engine'
import { getSocket } from '@/lib/socket-client'
import { PlayerCard, MysteryCard } from './player-card'
import { MatchSim } from './match-sim'
import { Avatar } from './avatar'

interface CardState {
  id: string
  name: string
  rating: number
  pos: string
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

interface OnlineState {
  game: string
  code: string
  phase: 'waiting' | 'playing' | 'complete' | 'done'
  host: { name: string; telegramId: string | null } | null
  guest: { name: string; telegramId: string | null } | null
  hostSquad: CardState[]
  guestSquad: CardState[]
  round: number
  totalRounds: number
  turn: 'host' | 'guest'
  visible: string | null
  mystery: string | 'hidden' | null
  poolCount: number
  log: { at: number; text: string }[]
  match: MatchResult | null
  serverNow: number
}

interface Props {
  tgId: string
  name: string
  onExit: () => void
  onPoints: (delta: number) => void
}

type Opponent = 'ai' | 'online' | null

export function MysteryGame({ tgId, name, onExit, onPoints }: Props) {
  const [opponent, setOpponent] = useState<Opponent>(null)

  if (!opponent) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#2e1065,#09090b_65%)] p-4 text-white">
        <div className="mx-auto max-w-md space-y-4 pt-10">
          <button onClick={onExit} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
            ← رجوع
          </button>
          <div className="pt-4 text-center">
            <div className="text-4xl">🃏</div>
            <div className="mt-2 text-3xl font-black">اللاعب المجهول</div>
            <div className="mt-1 text-sm text-zinc-400">12 بطاقة — كل بطاقة من مركز مختلف بلا تكرار</div>
            <div className="mt-1 text-xs text-zinc-500">بطاقة ظاهرة وبطاقة سوداء… قلبك مع مين؟</div>
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setOpponent('ai')}
            className="w-full rounded-3xl border border-white/10 bg-gradient-to-l from-purple-500/25 to-fuchsia-500/10 p-6 text-right shadow-lg transition hover:brightness-125"
          >
            <div className="text-4xl">🤖</div>
            <div className="mt-2 text-xl font-black">ضد الذكاء الاصطناعي</div>
            <div className="mt-0.5 text-xs text-zinc-400">غامض الغموض ضد خصم يقرأ أفكارك — فوراً</div>
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setOpponent('online')}
            className="w-full rounded-3xl border border-white/10 bg-gradient-to-l from-emerald-500/25 to-teal-500/10 p-6 text-right shadow-lg transition hover:brightness-125"
          >
            <div className="text-4xl">🌍</div>
            <div className="mt-2 text-xl font-black">أونلاين — لاعب حقيقي</div>
            <div className="mt-0.5 text-xs text-zinc-400">مباراة سريعة أو غرفة بكود مع صديق</div>
          </motion.button>
        </div>
      </div>
    )
  }

  if (opponent === 'online') {
    return <OnlineMystery tgId={tgId} name={name} onExit={onExit} onPoints={onPoints} onBack={() => setOpponent(null)} />
  }
  return <AiMystery tgId={tgId} name={name} onExit={onExit} onPoints={onPoints} onBack={() => setOpponent(null)} />
}

// ================================================================
// ==================== المجهول ضد الذكاء الاصطناعي ====================
// ================================================================
function AiMystery({ tgId, name, onExit, onPoints, onBack }: Props & { onBack: () => void }) {
  const [state, setState] = useState<MysteryState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [match, setMatch] = useState<MatchResult | null>(null)
  const [pointsEarned, setPointsEarned] = useState<number | null>(null)
  const [lastPick, setLastPick] = useState<{ choice: string; picked: string; other: string } | null>(null)
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
        setLastPick({
          choice: choice === 'mystery' ? 'الكرت المجهول' : 'الكرت الظاهر',
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
        <button onClick={onBack} className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-bold">
          رجوع
        </button>
      </div>
    )
  }

  const visibleCard = state.visible ? CARD_BY_ID.get(state.visible) || null : null
  const myTurn = state.turn === 'me' && state.phase === 'picking'

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#2e1065,#09090b_65%)] pb-8 text-white">
      <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-5">
        {/* الرأس */}
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
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
                    <PlayerCard key={`${c.id}-${i}`} card={CARD_BY_ID.get(c.id) || null} size={80} />
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <div className="mb-2 text-center text-sm font-black">🔵 {state.aiPersona.emoji} {state.aiPersona.name}</div>
                <div className="flex flex-wrap justify-center gap-2">
                  {state.rivalSquad.map((c, i) => (
                    <PlayerCard key={`${c.id}-${i}`} card={CARD_BY_ID.get(c.id) || null} size={80} />
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

        {/* المحاكاة — متابعة → الرئيسة */}
        <AnimatePresence>
          {match && (
            <MatchSim
              match={match}
              homeName={name}
              homeTgId={tgId}
              awayName={`${state.aiPersona.emoji} ${state.aiPersona.name}`}
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
// ==================== المجهول أونلاين (لاعب حقيقي) ====================
// ================================================================
function OnlineMystery({ tgId, name, onExit, onPoints, onBack }: Props & { onBack: () => void }) {
  const [view, setView] = useState<'lobby' | 'game'>('lobby')
  const [seat, setSeat] = useState<'host' | 'guest' | 'spect' | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [st, setSt] = useState<OnlineState | null>(null)
  const [error, setError] = useState('')
  const [pointsEarned, setPointsEarned] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const finishingRef = useRef(false)
  const seatRef = useRef<'host' | 'guest' | 'spect' | null>(null)

  useEffect(() => {
    seatRef.current = seat
  }, [seat])

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
        if (s.game !== 'mystery') return
        setSt(s)
        if (s.phase === 'done' && s.match && !finishingRef.current && seatRef.current !== 'spect') {
          finishingRef.current = true
          const my = seatRef.current === 'host' ? s.match.scoreHome : s.match.scoreAway
          const their = seatRef.current === 'host' ? s.match.scoreAway : s.match.scoreHome
          const result = my > their ? 'win' : my < their ? 'loss' : 'draw'
          const delta = result === 'win' ? POINTS.mysteryWin : result === 'loss' ? POINTS.loss : POINTS.draw
          setPointsEarned(delta)
          onPoints(delta)
          if (tgId) {
            void fetch('/api/kingdom/finish', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                tgId,
                name,
                game: 'mystery',
                mode: '',
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

  const quickMatch = useCallback(() => {
    void (async () => {
      const socket = await ensureSocket()
      socket.emit('mystery:create', { name, telegramId: tgId, quick: true }, (res: { ok: boolean; code: string; seat: 'host' | 'guest' | 'spect' }) => {
        if (res?.ok) {
          setRoomCode(res.code)
          setSeat(res.seat)
          setView('game')
        }
      })
    })()
  }, [ensureSocket, name, tgId])

  const createRoom = useCallback(() => {
    void (async () => {
      const socket = await ensureSocket()
      socket.emit('mystery:create', { name, telegramId: tgId }, (res: { ok: boolean; code: string; seat: 'host' | 'guest' | 'spect' }) => {
        if (res?.ok) {
          setRoomCode(res.code)
          setSeat(res.seat)
          setView('game')
        }
      })
    })()
  }, [ensureSocket, name, tgId])

  const joinRoom = useCallback(
    (code: string) => {
      const clean = code.trim().toUpperCase().slice(0, 4)
      if (clean.length < 4) return
      void (async () => {
        const socket = await ensureSocket()
        socket.emit('mystery:join', { code: clean, name, telegramId: tgId }, (res: { ok: boolean; code?: string; seat?: string; error?: string }) => {
          if (res?.ok && res.code) {
            setRoomCode(res.code)
            setSeat((res.seat as 'host' | 'guest' | 'spect') || 'spect')
            setView('game')
          } else {
            setError(res?.error || 'تعذر الانضمام')
            setTimeout(() => setError(''), 2500)
          }
        })
      })()
    },
    [ensureSocket, name, tgId],
  )

  const pick = (choice: 'visible' | 'mystery') => {
    socketRef.current?.emit('mystery:pick', { code: roomCode, choice }, (res: { ok: boolean; error?: string }) => {
      if (res && !res.ok && res.error) {
        setError(res.error)
        setTimeout(() => setError(''), 2500)
      }
    })
  }

  const perspective = useMemo(() => {
    if (!st || !seat || seat === 'spect') return null
    const isHost = seat === 'host'
    return {
      me: isHost ? st.host : st.guest,
      rival: isHost ? st.guest : st.host,
      mySquad: isHost ? st.hostSquad : st.guestSquad,
      rivalSquad: isHost ? st.guestSquad : st.hostSquad,
      myTurn: st.turn === seat && st.phase === 'playing',
    }
  }, [st, seat])

  // ===== اللوبي =====
  if (view === 'lobby') {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#2e1065,#09090b_65%)] p-4 text-white">
        <div className="mx-auto max-w-md space-y-4 pt-8">
          <button onClick={onBack} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
            ← رجوع
          </button>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center">
            <div className="text-3xl">🃏</div>
            <div className="mt-1 text-xl font-black">المجهول أونلاين</div>
            <div className="mt-1 text-xs text-zinc-400">12 بطاقة من مراكز مختلفة — اختيارات متبادلة</div>
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

  const spectating = seat === 'spect'
  const visibleCard = st.visible ? CARD_BY_ID.get(st.visible) || null : null
  const canPick = !spectating && perspective?.myTurn

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#2e1065,#09090b_65%)] pb-8 text-white">
      <div className="mx-auto max-w-3xl space-y-4 p-3 sm:p-5">
        {/* الرأس */}
        <div className="flex items-center justify-between">
          <button onClick={onExit} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
            ← خروج
          </button>
          <div className="rounded-2xl bg-purple-500/20 px-4 py-1.5 text-sm font-black text-purple-300">
            🃏 <span className="font-mono text-amber-300">{st.code}</span> · {Math.min(st.round, st.totalRounds)}/{st.totalRounds}
          </div>
          <div className="text-xs font-bold text-zinc-400">متبقي {st.poolCount} كرت</div>
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
              <Avatar telegramId={spectating ? st.host?.telegramId : seat === 'host' ? tgId : st.host?.telegramId} name={spectating ? st.host?.name : perspective?.me?.name} size={38} ring="#a78bfa" />
              <div className="text-sm font-bold">
                {spectating ? st.host?.name : `${perspective?.me?.name} (أنت)`}
              </div>
            </div>
            <div className="text-xs font-black text-zinc-500">VS</div>
            <div className="flex items-center gap-2">
              <div className="text-left text-sm font-bold">{spectating ? st.guest?.name : perspective?.rival?.name}</div>
              <Avatar telegramId={spectating ? st.guest?.telegramId : seat === 'host' ? st.guest?.telegramId : st.host?.telegramId} name={spectating ? st.guest?.name : perspective?.rival?.name} size={38} ring="#f472b6" />
            </div>
          </div>
        )}

        {/* منطقة الاختيار */}
        {st.phase === 'playing' && (
          <div className="space-y-4">
            <div className={`rounded-2xl p-3 text-center text-base font-black ${canPick ? 'animate-pulse bg-emerald-500/20 text-emerald-300' : 'bg-sky-500/20 text-sky-300'}`}>
              {spectating ? '👀 مشاهدة المباراة' : canPick ? '🎭 دورك — اختر: الظاهر أم المجهول؟' : `⏳ ${perspective?.rival?.name || 'الخصم'} يختار…`}
            </div>

            <div className="flex items-end justify-center gap-6">
              <div className="text-center">
                <PlayerCard card={visibleCard} size={165} selected={canPick} onClick={canPick ? () => pick('visible') : undefined} />
                <button
                  disabled={!canPick}
                  onClick={() => pick('visible')}
                  className="mt-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-black transition enabled:hover:bg-white/20 disabled:opacity-40"
                >
                  خذ الظاهر
                </button>
              </div>
              <div className="text-center">
                <MysteryCard size={165} selected={canPick} onClick={canPick ? () => pick('mystery') : undefined} />
                <button
                  disabled={!canPick}
                  onClick={() => pick('mystery')}
                  className="mt-2 rounded-xl bg-purple-500/30 px-4 py-2 text-sm font-black text-purple-200 transition enabled:hover:bg-purple-500/50 disabled:opacity-40"
                >
                  جرّب حظك بالمجهول
                </button>
              </div>
            </div>
          </div>
        )}

        {/* السجل */}
        {st.phase !== 'waiting' && (
          <div className="h-24 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-2 text-xs" dir="rtl">
            {st.log.slice().reverse().map((l, i) => (
              <div key={`${l.at}-${i}`} className="text-zinc-300">
                {l.text}
              </div>
            ))}
          </div>
        )}

        {/* التشكيلتان */}
        {st.phase !== 'waiting' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-purple-400/30 bg-white/5 p-2.5">
              <div className="mb-1.5 text-xs font-black text-zinc-300">{spectating ? st.host?.name : 'تشكيلتك'} ({(spectating ? st.hostSquad : perspective!.mySquad).length})</div>
              <div className="flex flex-wrap gap-1">
                {(spectating ? st.hostSquad : perspective!.mySquad).map((c, i) => (
                  <div key={`${c.id}-${i}`} className="rounded-lg bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-zinc-200">
                    {c.name} <span className="text-amber-300">{c.rating}</span>
                  </div>
                ))}
                {!(spectating ? st.hostSquad : perspective!.mySquad).length && <div className="text-[10px] text-zinc-500">—</div>}
              </div>
            </div>
            <div className="rounded-2xl border border-pink-400/30 bg-white/5 p-2.5">
              <div className="mb-1.5 text-xs font-black text-zinc-300">{spectating ? st.guest?.name : perspective!.rival?.name} ({(spectating ? st.guestSquad : perspective!.rivalSquad).length})</div>
              <div className="flex flex-wrap gap-1">
                {(spectating ? st.guestSquad : perspective!.rivalSquad).map((c, i) => (
                  <div key={`${c.id}-${i}`} className="rounded-lg bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-zinc-200">
                    {c.name} <span className="text-amber-300">{c.rating}</span>
                  </div>
                ))}
                {!(spectating ? st.guestSquad : perspective!.rivalSquad).length && <div className="text-[10px] text-zinc-500">—</div>}
              </div>
            </div>
          </div>
        )}

        {/* اكتمال — المباراة تلقائياً بعد 3 ثوانٍ */}
        {st.phase === 'complete' && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-purple-400/30 bg-purple-500/10 p-4 text-center">
              <div className="text-xl font-black text-purple-300">🏁 اكتملت الكروت الـ 12!</div>
              <div className="mt-1 animate-pulse text-sm text-zinc-300">تبدأ المباراة بعد لحظات… ⚽</div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <div className="mb-2 text-center text-sm font-black">🟢 {st.host?.name}</div>
                <div className="flex flex-wrap justify-center gap-2">
                  {st.hostSquad.map((c, i) => (
                    <PlayerCard key={`${c.id}-${i}`} card={CARD_BY_ID.get(c.id) || null} size={80} />
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                <div className="mb-2 text-center text-sm font-black">🔵 {st.guest?.name}</div>
                <div className="flex flex-wrap justify-center gap-2">
                  {st.guestSquad.map((c, i) => (
                    <PlayerCard key={`${c.id}-${i}`} card={CARD_BY_ID.get(c.id) || null} size={80} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* المحاكاة — متابعة → الرئيسة */}
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
