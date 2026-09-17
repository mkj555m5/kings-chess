'use client'

// شاشة اللعب الأونلاين ضد لاعبين حقيقيين عبر socket.io
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { connectGameConnection, type GameConnection } from '@/lib/socket-client'
import { GameShell, type ActionButtonDesc, type PlayerCardData } from './game-shell'
import { PromotionDialog, GameOverDialog, DrawOfferDialog } from './dialogs'
import type { ChatMessage } from './messages'
import { TIME_CONTROL_LABEL, type TimeControl } from '@/lib/game-types'
import { colorNameAr, deriveView, materialDiff, reasonToAr } from '@/lib/game-utils'
import { sfx } from '@/lib/sound'
import { recordGame, type LocalStats } from '@/lib/local-stats'

export interface OnlineGameConfig {
  playerName: string
  timeControl: TimeControl
  flow: 'quick' | 'create' | 'join' | 'challenge'
  joinCode?: string
}

interface ServerGameState {
  code: string
  fen: string
  turn: 'w' | 'b'
  lastMove: { from: string; to: string; san: string } | null
  historySan: string[]
  captured: { w: string[]; b: string[] }
  clocks: { w: number; b: number }
  serverNow: number
  timeControl: TimeControl
  checkSquare: string | null
  status: { over: boolean; result: 'white' | 'black' | 'draw' | null; reason: string | null }
  players: {
    white: { name: string; connected: boolean } | null
    black: { name: string; connected: boolean } | null
  }
  moveNumber: number
}

type Phase = 'connecting' | 'searching' | 'waiting' | 'playing'

export function OnlineGame({
  config,
  onExit,
  onStats,
}: {
  config: OnlineGameConfig
  onExit: () => void
  onStats: (s: LocalStats) => void
}) {
  const socketRef = useRef<GameConnection | null>(null)
  const [phase, setPhase] = useState<Phase>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [myColor, setMyColor] = useState<'white' | 'black'>('white')
  const [gameState, setGameState] = useState<ServerGameState | null>(null)
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [drawOfferFrom, setDrawOfferFrom] = useState<'white' | 'black' | null>(null)
  const [rematchOfferFrom, setRematchOfferFrom] = useState<'white' | 'black' | null>(null)
  const [rematchOffered, setRematchOffered] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null)
  const [overDialog, setOverDialog] = useState(false)
  const [clientClock, setClientClock] = useState<{ w: number; b: number } | null>(null)

  const recordedRef = useRef(false)
  const rejoinRef = useRef<{ code: string; color: 'white' | 'black' } | null>(null)
  const myColorRef = useRef<'white' | 'black'>('white')
  const lastMoveAtRef = useRef<number>(Date.now())
  const gameStateRef = useRef<ServerGameState | null>(null)

  const pushSystem = (text: string) => {
    setChat((prev) => [...prev.slice(-60), { id: `sys-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, from: 'system', name: 'النظام', text, at: Date.now() }])
  }

  // بدء الاتصال وتسجيل الأحداث
  useEffect(() => {
    let cancelled = false
    let socket: GameConnection | null = null

    const setup = (s: GameConnection) => {
    s.on('connect', () => {
      if (cancelled) return
      setError(null)
      // إعادة الانضمام بعد انقطاع
      if (rejoinRef.current) {
        s.emit('room:join', { name: config.playerName, code: rejoinRef.current.code })
        return
      }
      if (config.flow === 'quick') {
        setPhase('searching')
        s.emit('lobby:quick', { name: config.playerName, timeControl: config.timeControl })
      } else if (config.flow === 'create') {
        s.emit('room:create', { name: config.playerName, timeControl: config.timeControl })
      } else if (config.flow === 'join') {
        s.emit('room:join', { name: config.playerName, code: config.joinCode })
      } else if (config.flow === 'challenge') {
        // رابط تحدي من بوت تلجرام: نطلب الغرفة بكود التحدي تحديداً
        // الخادم ينشئها بذلك الكود، أو ينضم لمن سبقه تلقائياً (مضاعف الوصول آمن)
        s.emit('room:create', { name: config.playerName, timeControl: config.timeControl, preferredCode: config.joinCode })
      }
    })

    s.on('connect_error', () => {
      if (!cancelled) setError('تعذر الاتصال بخادم اللعب… جارٍ إعادة المحاولة')
    })

    s.on('disconnect', () => {
      if (!cancelled) setError('انقطع الاتصال… جارٍ إعادة المحاولة')
    })

    s.on('lobby:searching', () => {
      if (!cancelled) setPhase('searching')
    })

    s.on('lobby:matched', (data: { code: string; color: 'white' | 'black'; opponent: { name: string } }) => {
      if (cancelled) return
      myColorRef.current = data.color
      rejoinRef.current = { code: data.code, color: data.color }
      setMyColor(data.color)
      setRoomCode(data.code)
      setPhase('playing')
      pushSystem(`تمت المباراة! خصمك: ${data.opponent.name}`)
    })

    s.on('room:created', (data: { code: string }) => {
      if (cancelled) return
      myColorRef.current = 'white'
      rejoinRef.current = { code: data.code, color: 'white' }
      setRoomCode(data.code)
      setMyColor('white')
      setPhase('waiting')
      if (config.flow === 'challenge') pushSystem('غرفة التحدي جاهزة — انتظار انضمام خصمك…')
    })

    s.on('room:joined', (data: { code: string; color: 'white' | 'black'; reconnected?: boolean; opponent?: string | null }) => {
      if (cancelled) return
      myColorRef.current = data.color
      rejoinRef.current = { code: data.code, color: data.color }
      setMyColor(data.color)
      setRoomCode(data.code)
      setPhase('playing')
      if (data.reconnected) pushSystem('تمت استعادة اتصالك بالمباراة')
      else pushSystem(`انضممت للغرفة، خصمك: ${data.opponent || 'الخصم'}`)
    })

    s.on('room:error', (data: { message: string }) => {
      if (cancelled) return
      setError(data.message)
      rejoinRef.current = null
      setPhase('connecting')
      socket.disconnect()
      setTimeout(() => onExit(), 1500)
    })

    s.on('game:state', (s: ServerGameState) => {
      if (cancelled) return
      const prev = gameStateRef.current
      if (prev && prev.fen !== s.fen) {
        // صوت النقلة الجديدة
        const lastSan = s.historySan[s.historySan.length - 1] || ''
        if (lastSan.includes('#')) sfx.capture()
        else if (lastSan.includes('+')) sfx.check()
        else if (s.lastMove && prev.captured.w.length + prev.captured.b.length !== s.captured.w.length + s.captured.b.length) sfx.capture()
        else sfx.move()
      }
      gameStateRef.current = s
      setGameState(s)
      setPhase('playing')
      lastMoveAtRef.current = Date.now()
      setClientClock({ w: s.clocks.w, b: s.clocks.b })
      if (!s.status.over) setOverDialog(false)
    })

    s.on('game:over', (data: { result: 'white' | 'black' | 'draw'; reason: string }) => {
      if (cancelled) return
      setDrawOfferFrom(null)
      setRematchOfferFrom(null)
      setOverDialog(true)
      // أصوات النتيجة
      if (data.result === 'draw') sfx.draw()
      else if (data.result === myColorRef.current) sfx.win()
      else sfx.lose()

      // تسجيل النتيجة مرة واحدة
      if (!recordedRef.current) {
        recordedRef.current = true
        const result = data.result === 'draw' ? 'draw' : data.result === myColorRef.current ? 'win' : 'loss'
        const stats = recordGame({
          mode: 'online',
          result,
          opponent: gameStateRef.current?.players[myColorRef.current === 'white' ? 'black' : 'white']?.name || 'لاعب',
          moves: gameStateRef.current?.historySan.length || 0,
        })
        onStats(stats)
        void fetch('/api/stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerName: config.playerName,
            mode: 'online',
            result,
            playerColor: myColorRef.current,
            opponent: gameStateRef.current?.players[myColorRef.current === 'white' ? 'black' : 'white']?.name || 'لاعب',
            moves: gameStateRef.current?.historySan.length || 0,
            durationSec: 0,
          }),
        }).catch(() => {})
      }
    })

    s.on('opponent:joined', (data: { name: string }) => {
      if (!cancelled) pushSystem(`${data.name} انضم للمباراة!`)
    })

    s.on('opponent:reconnected', () => {
      if (!cancelled) pushSystem('عاد الخصم للمباراة')
    })

    s.on('opponent:left', () => {
      if (!cancelled) pushSystem('غادر الخصم المباراة… يمكنك انتظار عودته قليلاً')
    })

    s.on('chat:message', (m: { from: 'white' | 'black'; name: string; text: string; at: number }) => {
      if (cancelled) return
      sfx.chatMessage()
      setChat((prev) => [...prev.slice(-60), { id: `m-${m.at}-${Math.random().toString(36).slice(2, 5)}`, from: m.from, name: m.name, text: m.text, at: m.at }])
    })

    s.on('game:draw-offered', (d: { from: 'white' | 'black' }) => {
      if (!cancelled) setDrawOfferFrom(d.from)
    })

    s.on('game:draw-declined', () => {
      if (!cancelled) pushSystem('رفض الخصم عرض التعادل')
    })

    s.on('rematch:offered', (d: { from: 'white' | 'black' }) => {
      if (!cancelled) setRematchOfferFrom(d.from)
    })

    s.on('rematch:declined', () => {
      if (!cancelled) pushSystem('رفض الخصم مباراة الثأر')
    })

    s.on('rematch:started', () => {
      if (!cancelled) {
        recordedRef.current = false
        setOverDialog(false)
        setRematchOffered(false)
        setRematchOfferFrom(null)
        pushSystem('مباراة جديدة بدأت مع تبديل الألوان!')
      }
    })

    }

    void connectGameConnection().then((s) => {
      if (cancelled) {
        s.disconnect()
        return
      }
      socket = s
      socketRef.current = s
      setup(s)
    })

    return () => {
      cancelled = true
      if (socket) {
        socket.emit('room:leave')
        socket.disconnect()
      }
    }
  }, [])

  // عداد الوقت المحلي بين تحديثات الخادم
  useEffect(() => {
    if (!gameState || gameState.status.over || gameState.timeControl === 'none') return
    const iv = setInterval(() => {
      const elapsed = Date.now() - lastMoveAtRef.current
      setClientClock((prev) => {
        if (!prev) return prev
        const turn = gameStateRef.current?.turn
        if (!turn) return prev
        const base = { w: gameStateRef.current?.clocks.w ?? prev.w, b: gameStateRef.current?.clocks.b ?? prev.b }
        base[turn] = Math.max(0, base[turn] - elapsed)
        // المطالبة بانتهاء الوقت
        if (base[turn] <= 0 && turn === (myColorRef.current === 'white' ? 'w' : 'b')) {
          socketRef.current?.emit('game:timeout', { code: roomCode })
        }
        return base
      })
    }, 250)
    return () => clearInterval(iv)
  }, [gameState, roomCode])

  const chess = useMemo(() => {
    try {
      return new Chess(gameState?.fen || 'start')
    } catch {
      return new Chess()
    }
  }, [gameState?.fen])

  const view = useMemo(() => deriveView(chess), [gameState?.fen])

  const legalTargets = useMemo(() => {
    const map = new Map<string, boolean>()
    if (!selected || !gameState || gameState.status.over) return map
    if (view.turn !== (myColor === 'white' ? 'w' : 'b')) return map
    for (const m of chess.moves({ square: selected as never, verbose: true })) {
      map.set(m.to, !!m.captured)
    }
    return map
  }, [selected, chess, view.turn, myColor, gameState])

  const opponent = gameState?.players[myColor === 'white' ? 'black' : 'white']
  const me = gameState?.players[myColor]
  const myTurn = view.turn === (myColor === 'white' ? 'w' : 'b') && !gameState?.status.over

  const handleSquareClick = useCallback(
    (square: string) => {
      if (!gameState || gameState.status.over || pendingPromotion) return
      const myC = myColor === 'white' ? 'w' : 'b'
      if (view.turn !== myC) return
      const piece = chess.get(square as never)

      if (selected) {
        if (legalTargets.has(square)) {
          const isPawn = chess.get(selected as never)?.type === 'p'
          const lastRank = myC === 'w' ? '8' : '1'
          if (isPawn && square[1] === lastRank) {
            setPendingPromotion({ from: selected, to: square })
            return
          }
          socketRef.current?.emit('game:move', { code: roomCode, from: selected, to: square })
          setSelected(null)
          return
        }
        if (piece && piece.color === myC) {
          setSelected(square)
          sfx.select()
          return
        }
        setSelected(null)
        return
      }
      if (piece && piece.color === myC) {
        setSelected(square)
        sfx.select()
      }
    },
    [gameState, pendingPromotion, selected, legalTargets, chess, view.turn, myColor, roomCode],
  )

  const handleDropMove = useCallback(
    (from: string, to: string) => {
      if (!selected || from !== selected) return
      handleSquareClick(to)
    },
    [selected, handleSquareClick],
  )

  const resign = () => socketRef.current?.emit('game:resign', { code: roomCode })
  const offerDraw = () => {
    socketRef.current?.emit('game:draw-offer', { code: roomCode })
    pushSystem('أرسلت عرض تعادل للخصم')
  }
  const offerRematch = () => {
    setRematchOffered(true)
    socketRef.current?.emit('game:rematch-offer', { code: roomCode })
  }

  const cardFor = (c: 'w' | 'b'): PlayerCardData => {
    const colorKey = c === 'w' ? 'white' : 'black'
    const player = gameState?.players[colorKey]
    const isMe = colorKey === myColor
    const lead = materialDiff(gameState?.captured.w || [], gameState?.captured.b || [])
    return {
      name: player?.name || (isMe ? config.playerName : 'في انتظار لاعب…'),
      color: c,
      isTurn: view.turn === c && !gameState?.status.over,
      capturedPieces: gameState?.captured[c] || [],
      materialLead: c === 'w' ? Math.max(0, lead) : Math.max(0, -lead),
      clockMs: gameState && gameState.timeControl !== 'none' ? clientClock?.[c] ?? gameState.clocks[c] : null,
      clockActive: view.turn === c && !gameState?.status.over && !!gameState?.players.white && !!gameState?.players.black,
      connected: player?.connected ?? true,
    }
  }

  const orientation = myColor
  const bottomColor: 'w' | 'b' = myColor === 'white' ? 'w' : 'b'
  const topColor: 'w' | 'b' = bottomColor === 'w' ? 'b' : 'w'

  const overResult: 'win' | 'loss' | 'draw' | null = gameState?.status.over
    ? gameState.status.result === 'draw'
      ? 'draw'
      : gameState.status.result === myColor
        ? 'win'
        : 'loss'
    : null

  const actions: ActionButtonDesc[] = [
    { label: 'عرض تعادل', onClick: offerDraw, disabled: !!gameState?.status.over },
    { label: 'استسلام', onClick: resign, variant: 'destructive', disabled: !!gameState?.status.over },
    { label: 'القائمة الرئيسية', onClick: onExit },
  ]

  // شاشات الانتظار
  if (phase !== 'playing' || !gameState) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-4" dir="rtl">
        <div className="relative">
          <div className="absolute -inset-6 animate-pulse rounded-full bg-amber-500/10 blur-2xl" />
          <div className="animate-bounce text-7xl">♞</div>
        </div>
        {error ? (
          <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-6 py-3 text-center text-sm font-semibold text-red-300">
            {error}
          </div>
        ) : (
          <div className="text-center">
            <div className="animate-pulse text-lg font-bold text-amber-300">
              {phase === 'connecting' && 'جارٍ الاتصال بخادم اللعب…'}
              {phase === 'searching' && 'يبحث عن لاعب مناسب…'}
              {phase === 'waiting' && 'انتظار انضمام الخصم…'}
            </div>
            <div className="mt-1 text-sm text-stone-500">
              {phase === 'searching' && `الوقت: ${TIME_CONTROL_LABEL[config.timeControl]}`}
            </div>
          </div>
        )}
        {phase === 'waiting' && roomCode && (
          <div className="rounded-2xl border border-amber-700/50 bg-stone-900/80 p-5 text-center shadow-lg">
            <div className="mb-1 text-xs font-semibold text-stone-400">شارك هذا الكود مع صديقك</div>
            <div className="mb-3 font-mono text-4xl font-extrabold tracking-[0.35em] text-amber-300" dir="ltr">
              {roomCode}
            </div>
            <button
              onClick={() => {
                void navigator.clipboard?.writeText(roomCode)
                pushSystem('تم نسخ الكود')
              }}
              className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-bold text-stone-950 transition-colors hover:bg-amber-500"
            >
              نسخ الكود
            </button>
          </div>
        )}
        <button
          onClick={onExit}
          className="rounded-lg border border-stone-700 px-4 py-2 text-sm text-stone-300 transition-colors hover:bg-stone-800"
        >
          إلغاء والعودة للقائمة
        </button>
      </div>
    )
  }

  return (
    <GameShell
      mode="online"
      topCard={cardFor(topColor)}
      bottomCard={cardFor(bottomColor)}
      board={view.board}
      orientation={orientation}
      selected={selected}
      legalTargets={legalTargets}
      lastMove={view.lastMove}
      checkSquare={view.checkSquare}
      interactive={myTurn && !pendingPromotion}
      movableColor={myColor === 'white' ? 'w' : 'b'}
      onSquareClick={handleSquareClick}
      onDropMove={handleDropMove}
      showEval={false}
      evalCp={null}
      statusText={
        gameState.status.over
          ? reasonToAr(gameState.status.reason)
          : myTurn
            ? 'دورك — حرّك قطعك'
            : `دور ${opponent?.name || 'الخصم'}…`
      }
      statusSub={view.checkSquare ? 'كش!' : `الغرفة: ${roomCode}`}
      aiMessages={[]}
      aiThinking={false}
      aiDifficultyLabel="لعب أونلاين"
      aiModelLabel="لاعب حقيقي"
      chat={{
        messages: chat,
        onSend: (t) => socketRef.current?.emit('chat:message', { code: roomCode, text: t }),
        myName: me?.name || config.playerName,
        myColor,
      }}
      actions={actions}
      footerNote={
        <span>
          أنت تلعب بالـ{colorNameAr(myColor)} · كود الغرفة <span className="font-mono font-bold text-stone-400" dir="ltr">{roomCode}</span>
        </span>
      }
    >
      <PromotionDialog
        open={!!pendingPromotion}
        color={myColor === 'white' ? 'w' : 'b'}
        onChoose={(p) => {
          const pp = pendingPromotion
          setPendingPromotion(null)
          if (pp) socketRef.current?.emit('game:move', { code: roomCode, from: pp.from, to: pp.to, promotion: p })
        }}
        onCancel={() => setPendingPromotion(null)}
      />
      <GameOverDialog
        open={overDialog && !!overResult}
        result={overResult ?? 'draw'}
        reason={gameState.status.reason}
        winnerName={gameState.status.result && gameState.status.result !== 'draw' ? colorNameAr(gameState.status.result === 'white' ? 'w' : 'b') : null}
        onRematch={offerRematch}
        onExit={onExit}
        canRematch={!rematchOffered}
      />
      <DrawOfferDialog
        open={!!drawOfferFrom}
        fromName={gameState.players[drawOfferFrom || 'white']?.name || 'الخصم'}
        onAccept={() => {
          socketRef.current?.emit('game:draw-accept', { code: roomCode })
          setDrawOfferFrom(null)
        }}
        onDecline={() => {
          socketRef.current?.emit('game:draw-decline', { code: roomCode })
          setDrawOfferFrom(null)
        }}
      />
      {rematchOfferFrom && !gameState.status.over && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-amber-600/60 bg-stone-900 px-4 py-3 shadow-2xl">
          <span className="text-sm text-amber-200">الخصم يطلب مباراة ثأر!</span>
          <button
            onClick={() => {
              socketRef.current?.emit('game:rematch-accept', { code: roomCode })
              setRematchOfferFrom(null)
            }}
            className="mr-3 rounded-lg bg-emerald-600 px-3 py-1 text-sm font-bold text-white hover:bg-emerald-500"
          >
            قبول
          </button>
          <button
            onClick={() => {
              socketRef.current?.emit('game:rematch-decline', { code: roomCode })
              setRematchOfferFrom(null)
            }}
            className="mr-2 rounded-lg border border-stone-600 px-3 py-1 text-sm text-stone-300 hover:bg-stone-800"
          >
            رفض
          </button>
        </div>
      )}
      {rematchOfferFrom && gameState.status.over && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-amber-600/60 bg-stone-900 px-4 py-3 shadow-2xl">
          <span className="text-sm text-amber-200">الخصم يطلب مباراة ثأر!</span>
          <button
            onClick={() => {
              socketRef.current?.emit('game:rematch-accept', { code: roomCode })
              setRematchOfferFrom(null)
            }}
            className="mr-3 rounded-lg bg-emerald-600 px-3 py-1 text-sm font-bold text-white hover:bg-emerald-500"
          >
            قبول
          </button>
        </div>
      )}
    </GameShell>
  )
}
