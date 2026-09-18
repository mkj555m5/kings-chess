'use client'

// ============ لعبة XO ⭕ ============
// ضد الذكاء الاصطناعي (محلي) أو أونلاين بغرفة كود مع صديق
// + مشاهدة الغرف النشطة مباشرة

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { Socket } from 'socket.io-client'
import { getSocket } from '@/lib/socket-client'
import { Avatar } from './avatar'
import { POINTS } from '@/lib/cards-data'

type Board = (string | null)[]

interface Props {
  tgId: string | null
  name: string
  onExit: () => void
  onPoints: (delta: number) => void
  initialView?: 'menu' | 'ai' | 'create' | 'join' | 'spectate'
  joinCode?: string
}

type View = 'menu' | 'ai' | 'create' | 'join' | 'game' | 'spectate' | 'watch'

export function XoGame({ tgId, name, onExit, onPoints, initialView = 'menu', joinCode }: Props) {
  const [view, setView] = useState<View>(initialView)
  const [board, setBoard] = useState<Board>(Array(9).fill(null))
  const [mySide, setMySide] = useState<'X' | 'O' | 'spect'>('spect')
  const [roomCode, setRoomCode] = useState('')
  const [status, setStatus] = useState<'waiting' | 'playing' | 'over'>('waiting')
  const [result, setResult] = useState<string | null>(null)
  const [winLine, setWinLine] = useState<number[] | null>(null)
  const [turn, setTurn] = useState<'X' | 'O'>('X')
  const [players, setPlayers] = useState<{ X: { name: string; telegramId: string | null } | null; O: { name: string; telegramId: string | null } | null }>({ X: null, O: null })
  const [codeInput, setCodeInput] = useState(joinCode || '')
  const [opponentLeft, setOpponentLeft] = useState(false)
  const [rematchOffered, setRematchOffered] = useState(false)
  const [spectRooms, setSpectRooms] = useState<{ code: string; status: string; x: { name: string; telegramId: string | null } | null; o: { name: string; telegramId: string | null } | null }[]>([])
  const [recorded, setRecorded] = useState(false)
  const [aiDifficulty, setAiDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium')
  const socketRef = useRef<Socket | null>(null)

  const ensureSocket = useCallback(async (): Promise<Socket> => {
    if (socketRef.current) return socketRef.current
    const s = await getSocket()
    socketRef.current = s
    return s
  }, [])

  // ===== ضد الذكاء الاصطناعي =====
  const [aiBoard, setAiBoard] = useState<Board>(Array(9).fill(null))
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]
  const winnerOf = (b: Board) => {
    for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return { side: b[a]!, line: [a, c, d] }
    return b.every(Boolean) ? { side: 'draw', line: null } : null
  }

  const aiMove = (b: Board, diff: string): Board => {
    const empty = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0)
    if (!empty.length) return b
    if (diff === 'easy' && Math.random() < 0.7) {
      const i = empty[Math.floor(Math.random() * empty.length)]
      const nb = [...b]
      nb[i] = 'O'
      return nb
    }
    if (diff === 'medium' && Math.random() < 0.35) {
      const i = empty[Math.floor(Math.random() * empty.length)]
      const nb = [...b]
      nb[i] = 'O'
      return nb
    }
    // hard: minimax
    const minimax = (bd: Board, isAi: boolean): number => {
      const w = winnerOf(bd)
      if (w) return w.side === 'O' ? 10 : w.side === 'X' ? -10 : 0
      let best = isAi ? -Infinity : Infinity
      for (const i of bd.map((v, j) => (v ? -1 : j)).filter((j) => j >= 0)) {
        bd[i] = isAi ? 'O' : 'X'
        const sc = minimax(bd, !isAi)
        bd[i] = null
        best = isAi ? Math.max(best, sc) : Math.min(best, sc)
      }
      return best
    }
    let bestScore = -Infinity
    let bestIdx = empty[0]
    for (const i of empty) {
      const nb = [...b]
      nb[i] = 'O'
      const sc = minimax(nb, false)
      if (sc > bestScore) {
        bestScore = sc
        bestIdx = i
      }
    }
    const nb = [...b]
    nb[bestIdx] = 'O'
    return nb
  }

  const playAi = (i: number) => {
    if (aiBoard[i] || winnerOf(aiBoard)) return
    const nb = [...aiBoard]
    nb[i] = 'X'
    const w1 = winnerOf(nb)
    setAiBoard(nb)
    if (!w1) {
      setTimeout(() => {
        const nb2 = aiMove(nb, aiDifficulty)
        setAiBoard(nb2)
      }, 450)
    }
  }

  const aiW = winnerOf(aiBoard)

  // تسجيل نقاط XO ضد AI
  useEffect(() => {
    if (aiW && tgId && !recorded) {
      setRecorded(true)
      const result = aiW.side === 'X' ? 'win' : aiW.side === 'O' ? 'loss' : 'draw'
      const delta = result === 'win' ? POINTS.xoWin : result === 'loss' ? POINTS.xoLoss : POINTS.xoDraw
      void fetch('/api/kingdom/finish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tgId, name, game: 'xo', mode: 'ai', result, scoreMe: result === 'win' ? 1 : 0, scoreRival: result === 'loss' ? 1 : 0, rivalName: 'الوزير XO' }),
      })
      onPoints(delta)
    }
    if (!aiW && recorded) setRecorded(false)
  }, [aiW, tgId, recorded, name, onPoints])

  // ===== الأونلاين =====
  useEffect(() => {
    if (view !== 'game' && view !== 'spectate') return
    let cancelled = false
    void (async () => {
      const socket = await ensureSocket()
      if (cancelled) return
      socketRef.current = socket

      const onState = (s: { code: string; board: Board; turn: string; status: string; result: string | null; winLine: number[] | null; players: { X: { name: string; telegramId: string | null } | null; O: { name: string; telegramId: string | null } | null } }) => {
        setBoard(s.board)
        setTurn(s.turn as 'X' | 'O')
        setStatus(s.status as 'waiting' | 'playing' | 'over')
        setResult(s.result)
        setWinLine(s.winLine)
        setPlayers(s.players)
      }
      const onOpponentLeft = () => setOpponentLeft(true)
      const onRematch = () => setRematchOffered(true)
      const onRematchStart = () => {
        setRematchOffered(false)
        setOpponentLeft(false)
        setRecorded(false)
      }

      socket.on('xo:state', onState)
      socket.on('xo:opponent:left', onOpponentLeft)
      socket.on('xo:rematch:offered', onRematch)
      socket.on('xo:rematch:declined', onRematch)
      socket.on('xo:rematch:started' as never, onRematchStart as never)
    })()

    return () => {
      cancelled = true
      void (async () => {
        const socket = socketRef.current
        if (!socket) return
        socket.off('xo:state')
        socket.off('xo:opponent:left')
        socket.off('xo:rematch:offered')
        socket.off('xo:rematch:declined')
        socket.off('xo:rematch:started' as never)
      })()
    }
  }, [view, ensureSocket])

  const createRoom = useCallback(() => {
    void (async () => {
      const socket = await ensureSocket()
      setView('game')
      socket.emit('xo:create', { name, telegramId: tgId }, (res: { ok: boolean; code: string; yourSide: 'X' }) => {
        if (res?.ok) {
          setRoomCode(res.code)
          setMySide('X')
        }
      })
    })()
  }, [name, tgId, ensureSocket])

  const joinRoom = useCallback(
    (code: string) => {
      const clean = code.trim().toUpperCase().slice(0, 4)
      if (clean.length < 4) return
      void (async () => {
        const socket = await ensureSocket()
        setView('game')
        socket.emit('xo:join', { name, code: clean, telegramId: tgId }, (res: { ok: boolean; code: string; yourSide: 'X' | 'O' | 'spect' }) => {
          if (res?.ok) {
            setRoomCode(res.code)
            setMySide(res.yourSide)
          }
        })
      })()
    },
    [name, tgId, ensureSocket],
  )

  // قائمة غرف المشاهدة
  const loadSpectRooms = useCallback(() => {
    void (async () => {
      const socket = await ensureSocket()
      socket.emit('xo:list', {}, (res: { ok: boolean; list: typeof spectRooms }) => {
        if (res?.ok) setSpectRooms(res.list)
      })
    })()
  }, [ensureSocket])

  useEffect(() => {
    if (view === 'spectate') {
      loadSpectRooms()
      const t = setInterval(loadSpectRooms, 4000)
      return () => clearInterval(t)
    }
  }, [view, loadSpectRooms])

  const spectate = (code: string) => {
    void (async () => {
      const socket = await ensureSocket()
      socket.emit('xo:spect:join', { code }, (res: { ok: boolean; state?: unknown }) => {
        if (res?.ok) {
          setRoomCode(code)
          setMySide('spect')
          setView('watch')
        }
      })
    })()
  }

  const play = (i: number) => {
    if (view === 'game' && status === 'playing' && turn === mySide && !board[i]) {
      socketRef.current?.emit('xo:move', { code: roomCode, index: i })
    }
  }

  const offerRematch = () => {
    socketRef.current?.emit('xo:rematch-offer', { code: roomCode })
    setRematchOffered(true)
  }

  const recordOnline = () => {
    if (recorded || !tgId || status !== 'over') return
    setRecorded(true)
    const myWin = result === mySide
    const isDraw = result === 'draw'
    const r = myWin ? 'win' : isDraw || mySide === 'spect' ? 'draw' : 'loss'
    if (mySide === 'spect') return
    const delta = r === 'win' ? POINTS.xoWin : r === 'loss' ? POINTS.xoLoss : POINTS.xoDraw
    const rival = mySide === 'X' ? players.O : players.X
    void fetch('/api/kingdom/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tgId,
        name,
        game: 'xo',
        mode: 'online',
        result: r,
        scoreMe: r === 'win' ? 1 : 0,
        scoreRival: r === 'loss' ? 1 : 0,
        rivalName: rival?.name || 'الخصم',
        rivalTgId: rival?.telegramId || null,
      }),
    })
    onPoints(delta)
  }

  useEffect(() => {
    if (status === 'over' && view === 'game' && mySide !== 'spect') recordOnline()
     
  }, [status, result])

  // ===== الواجهات =====
  const cellBtn = (v: string | null, i: number, canPlay: boolean, winLineIdx: boolean, onCell: (idx: number) => void) => (
    <motion.button
      key={i}
      whileTap={canPlay && !v ? { scale: 0.9 } : undefined}
      onClick={() => canPlay && onCell(i)}
      disabled={!canPlay || !!v}
      className={`flex aspect-square items-center justify-center rounded-2xl border text-5xl font-black transition ${
        winLineIdx ? 'border-amber-300 bg-amber-400/20 shadow-[0_0_16px_#fbbf2466]' : 'border-white/10 bg-white/5'
      } ${v === 'X' ? 'text-emerald-400' : 'text-sky-400'}`}
    >
      {v && (
        <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 300 }}>
          {v === 'X' ? '✕' : '◯'}
        </motion.span>
      )}
    </motion.button>
  )

  const statusText = () => {
    if (status === 'waiting') return '⏳ في انتظار انضمام الخصم — شارك الكود!'
    if (status === 'over') {
      if (mySide === 'spect') return result === 'draw' ? '🤝 تعادل' : `🏆 الفائز: ${result}`
      return result === 'draw' ? '🤝 تعادل!' : result === mySide ? '🏆 فوز رائع!' : '💔 خسارة'
    }
    if (mySide === 'spect') return `الدور على: ${turn}`
    return turn === mySide ? '🎯 دورك الآن!' : '⏳ دور الخصم…'
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#052e16,#09090b_65%)] pb-8 text-white">
      <div className="mx-auto max-w-xl space-y-4 p-4">
        <div className="flex items-center justify-between">
          <button onClick={onExit} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
            ← خروج
          </button>
          <div className="text-xl font-black">⭕ لعبة XO</div>
          <div className="w-16" />
        </div>

        {view === 'menu' && (
          <div className="grid gap-3">
            <button onClick={() => setView('ai')} className="rounded-3xl border border-white/10 bg-gradient-to-l from-emerald-500/20 to-teal-500/10 p-6 text-right transition hover:brightness-125">
              <div className="text-2xl font-black">🤖 ضد الذكاء الاصطناعي</div>
              <div className="text-sm text-zinc-400">ثلاث مستويات — من السهل إلى المستحيل</div>
            </button>
            <button onClick={createRoom} className="rounded-3xl border border-white/10 bg-gradient-to-l from-sky-500/20 to-blue-500/10 p-6 text-right transition hover:brightness-125">
              <div className="text-2xl font-black">🌐 إنشاء غرفة أونلاين</div>
              <div className="text-sm text-zinc-400">احصل على كود وأرسله لصديقك</div>
            </button>
            <button onClick={() => setView('join')} className="rounded-3xl border border-white/10 bg-gradient-to-l from-purple-500/20 to-fuchsia-500/10 p-6 text-right transition hover:brightness-125">
              <div className="text-2xl font-black">🔑 انضمام بكود</div>
              <div className="text-sm text-zinc-400">عندك كود غرفة صديقك؟ ادخل هنا</div>
            </button>
            <button
              onClick={() => setView('spectate')}
              className="rounded-3xl border border-white/10 bg-gradient-to-l from-amber-500/20 to-orange-500/10 p-6 text-right transition hover:brightness-125"
            >
              <div className="text-2xl font-black">👁️ مشاهدة اللاعبين</div>
              <div className="text-sm text-zinc-400">شاهد مباريات XO والشطرنج الجارية مباشرة</div>
            </button>
          </div>
        )}

        {view === 'ai' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {(['easy', 'medium', 'hard'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setAiDifficulty(d)
                    setAiBoard(Array(9).fill(null))
                    setRecorded(false)
                  }}
                  className={`flex-1 rounded-xl py-2 text-sm font-black transition ${aiDifficulty === d ? 'bg-emerald-500 text-black' : 'bg-white/10 text-zinc-300'}`}
                >
                  {d === 'easy' ? 'سهل' : d === 'medium' ? 'متوسط' : 'مستحيل'}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {aiBoard.map((v, i) => cellBtn(v, i, !aiW && !aiBoard.every(Boolean), aiW?.line?.includes(i) || false, playAi))}
            </div>
            <div className="text-center text-lg font-black">
              {aiW ? (aiW.side === 'X' ? '🏆 فوزك! أنت أسطورة' : aiW.side === 'O' ? '🤖 الوزير فاز هذه المرة' : '🤝 تعادل') : 'أنت ✕ — ابدأ بالعب!'}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => { setAiBoard(Array(9).fill(null)); setRecorded(false) }} className="rounded-2xl bg-white/10 py-3 font-black transition hover:bg-white/20">
                🔄 إعادة
              </button>
              <button onClick={() => setView('menu')} className="rounded-2xl bg-white/10 py-3 font-black transition hover:bg-white/20">
                القائمة
              </button>
            </div>
          </div>
        )}

        {view === 'join' && (
          <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-6">
            <div className="text-lg font-black">🔑 أدخل كود الغرفة (٤ أحرف)</div>
            <input
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
              placeholder="مثال: K7XP"
              className="w-full rounded-2xl border border-white/15 bg-black/40 p-4 text-center text-3xl font-black tracking-[0.4em] outline-none focus:border-emerald-400"
            />
            <button onClick={() => joinRoom(codeInput)} disabled={codeInput.length < 4} className="w-full rounded-2xl bg-emerald-500 py-3.5 text-lg font-black text-black transition enabled:hover:brightness-110 disabled:opacity-40">
              انضم الآن
            </button>
            <button onClick={() => setView('menu')} className="w-full rounded-2xl bg-white/10 py-2.5 font-bold">
              رجوع
            </button>
          </div>
        )}

        {(view === 'game' || view === 'watch') && (
          <div className="space-y-4">
            {/* الكود */}
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <Avatar telegramId={players.X?.telegramId} name={players.X?.name || '؟'} size={40} ring="#34d399" />
                <div>
                  <div className="text-sm font-bold">{players.X?.name || '…'}</div>
                  <div className="text-[10px] text-emerald-400">✕</div>
                </div>
              </div>
              <div className="text-center">
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(roomCode)
                  }}
                  className="rounded-xl bg-white/10 px-4 py-1.5 text-xl font-black tracking-[0.3em] text-amber-300 transition hover:bg-white/20"
                  title="انسخ الكود"
                >
                  {roomCode}
                </button>
                <div className="mt-0.5 text-[10px] text-zinc-500">اضغط لنسخ الكود</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-left">
                  <div className="text-sm font-bold">{players.O?.name || 'في انتظار…'}</div>
                  <div className="text-[10px] text-sky-400">◯</div>
                </div>
                <Avatar telegramId={players.O?.telegramId} name={players.O?.name || '؟'} size={40} ring="#38bdf8" />
              </div>
            </div>

            <div className={`rounded-2xl p-3 text-center text-base font-black ${status === 'over' ? 'bg-amber-500/20 text-amber-300' : 'bg-white/10 text-white'}`}>{statusText()}</div>

            <div className="grid grid-cols-3 gap-2.5">
              {board.map((v, i) =>
                cellBtn(v, i, view === 'game' && status === 'playing' && turn === mySide && mySide !== 'spect', winLine?.includes(i) || false, play),
              )}
            </div>

            {opponentLeft && status !== 'over' && <div className="rounded-xl bg-rose-500/20 p-3 text-center text-sm font-bold text-rose-300">😢 الخصم غادر الغرفة</div>}

            {status === 'over' && mySide !== 'spect' && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={offerRematch} className="rounded-2xl bg-emerald-500 py-3 font-black text-black transition hover:brightness-110">
                  {rematchOffered ? '…في انتظار الخصم' : '🔄 مباراة ثأر'}
                </button>
                <button onClick={() => setView('menu')} className="rounded-2xl bg-white/10 py-3 font-black transition hover:bg-white/20">
                  خروج
                </button>
              </div>
            )}
            {view === 'watch' && (
              <button onClick={() => setView('spectate')} className="w-full rounded-2xl bg-white/10 py-3 font-black transition hover:bg-white/20">
                ← قائمة الغرف
              </button>
            )}
          </div>
        )}

        {view === 'spectate' && (
          <div className="space-y-3">
            <div className="text-lg font-black">👁️ غرف XO النشطة الآن</div>
            {spectRooms.filter((r) => r.status !== 'waiting').length ? (
              spectRooms
                .filter((r) => r.status !== 'waiting')
                .map((r) => (
                  <button
                    key={r.code}
                    onClick={() => spectate(r.code)}
                    className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:bg-white/10"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar telegramId={r.x?.telegramId} name={r.x?.name} size={32} />
                      <span className="text-sm font-bold">{r.x?.name || '—'}</span>
                    </div>
                    <div className="text-center">
                      <div className="font-mono text-xs text-amber-300">{r.code}</div>
                      <div className="text-[10px] text-zinc-500">{r.status === 'playing' ? '🎮 جارية' : '🏁 انتهت'}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{r.o?.name || '—'}</span>
                      <Avatar telegramId={r.o?.telegramId} name={r.o?.name} size={32} />
                    </div>
                  </button>
                ))
            ) : (
              <div className="rounded-2xl bg-white/5 p-6 text-center text-sm text-zinc-400">لا توجد مباريات XO جارية الآن — افتح غرفة وانتظر الخصم!</div>
            )}
            <XoChessSpectator />
            <button onClick={() => setView('menu')} className="w-full rounded-2xl bg-white/10 py-3 font-black transition hover:bg-white/20">
              رجوع
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// قائمة غرف الشطرنج الجارية للمشاهدة (مضمنة هنا للوصول السريع)
function XoChessSpectator() {
  const [chessRooms, setChessRooms] = useState<{ code: string; playing: boolean; over: boolean; white: { name: string } | null; black: { name: string } | null; moveNumber: number }[]>([])
  useEffect(() => {
    let alive = true
    const load = async () => {
      const socket = await getSocket()
      if (!alive) return
      socket.emit('spect:list', {}, (res: { ok: boolean; list: typeof chessRooms }) => {
        if (res?.ok) setChessRooms(res.list.filter((r) => r.playing && !r.over))
      })
    }
    void load()
    const t = setInterval(() => void load(), 5000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  const watch = (code: string) => {
    window.dispatchEvent(new CustomEvent('kingdom:spectate-chess', { detail: { code } }))
  }
  if (!chessRooms.length) return null
  return (
    <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="text-sm font-black text-zinc-300">♟️ غرف الشطرنج الجارية</div>
      {chessRooms.slice(0, 6).map((r) => (
        <button key={r.code} onClick={() => watch(r.code)} className="flex w-full items-center justify-between rounded-xl bg-black/30 p-2.5 text-sm transition hover:bg-black/50">
          <span className="font-bold">⚪ {r.white?.name || '—'}</span>
          <span className="font-mono text-xs text-amber-300">{r.code}</span>
          <span className="font-bold">⚫ {r.black?.name || '—'}</span>
        </button>
      ))}
      <div className="text-center text-[10px] text-zinc-500">اضغط على غرفة لطلب مشاهدة الشطرنج</div>
    </div>
  )
}
