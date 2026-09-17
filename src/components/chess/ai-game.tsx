'use client'

// شاشة اللعب ضد الوزير (الذكاء الاصطناعي) + اللعب المحلي للاعبين
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { GameShell, type ActionButtonDesc, type PlayerCardData } from './game-shell'
import { PromotionDialog, GameOverDialog } from './dialogs'
import type { AIMessage } from './messages'
import {
  DIFFICULTY_LABEL,
  type Difficulty,
  type PieceColor,
  type TimeControl,
} from '@/lib/game-types'
import { colorNameAr, deriveView, materialDiff, timeControlMs } from '@/lib/game-utils'
import { getRankedMoves } from '@/lib/chess-engine'
import { sfx } from '@/lib/sound'
import { recordGame, type LocalStats } from '@/lib/local-stats'

// ميزانية المحرك تعمل في متصفح اللاعب (مناسبة لحدود CPU المجانية في Cloudflare)
const ENGINE_BUDGET: Record<Difficulty, { depth: number; maxNodes: number; deadlineMs: number }> = {
  easy: { depth: 1, maxNodes: 20000, deadlineMs: 600 },
  medium: { depth: 2, maxNodes: 60000, deadlineMs: 1500 },
  hard: { depth: 3, maxNodes: 120000, deadlineMs: 2500 },
}

const AI_MODEL_LABEL = 'نموذج gemma4'

const AI_EDGE_COMMENTS = {
  playerResigned: [
    'قرار حكيم… العودة دائماً أقوى من الوقوف في طريق العاصفة.',
    'استسلمت؟ كنت أرحمك تدريجياً، أعدها في أي وقت.',
  ],
  playerTimedOut: [
    'انتهى وقتك! في الشطرنج كما في الحياة، التأني نصف الذكاء.',
    'الساعة لا ترحم… فوز آخر يُضاف لسجلي.',
  ],
  aiTimedOut: ['انتهى وقتي؟ يبدو أن التفكير العميق يحتاج وقتاً أطول… أعدك بالانتباه قريباً.'],
}

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

export interface AIGameConfig {
  mode: 'ai' | 'local'
  difficulty: Difficulty
  playerColor: 'white' | 'black'
  timeControl: TimeControl
  playerName: string
  whiteName?: string
  blackName?: string
}

export function AIGame({
  config,
  onExit,
  onStats,
}: {
  config: AIGameConfig
  onExit: () => void
  onStats: (s: LocalStats) => void
}) {
  const isAI = config.mode === 'ai'
  const playerColor: PieceColor = config.playerColor === 'white' ? 'w' : 'b'
  const aiColor: PieceColor = playerColor === 'w' ? 'b' : 'w'
  const baseMs = timeControlMs(config.timeControl)

  const chessRef = useRef<Chess>(new Chess())
  const [fen, setFen] = useState(chessRef.current.fen())
  const [selected, setSelected] = useState<string | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null)
  const [aiThinking, setAiThinking] = useState(false)
  const [aiMessages, setAiMessages] = useState<AIMessage[]>([])
  const [evalCp, setEvalCp] = useState<number | null>(null)
  const [gameOver, setGameOver] = useState<{ result: 'win' | 'loss' | 'draw'; reason: string; aiComment?: string } | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [clocks, setClocks] = useState<{ w: number; b: number } | null>(baseMs ? { w: baseMs, b: baseMs } : null)
  const [flip, setFlip] = useState(false)

  const view = useMemo(() => deriveView(chessRef.current), [fen])

  const aiBusyRef = useRef(false)
  const requestedFenRef = useRef<string | null>(null)
  const reactionAbortRef = useRef<AbortController | null>(null)
  const recordedRef = useRef(false)
  const startedAtRef = useRef(Date.now())
  const lastTickRef = useRef(Date.now())

  const playerName = config.playerName
  const aiName = 'الوزير'
  const whiteName = config.mode === 'local' ? config.whiteName || 'الأبيض' : playerColor === 'w' ? playerName : aiName
  const blackName = config.mode === 'local' ? config.blackName || 'الأسود' : playerColor === 'b' ? playerName : aiName

  const pushAiMessage = useCallback((text: string) => {
    setAiMessages((prev) => [...prev.slice(-30), { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, at: Date.now() }])
  }, [])

  // تحديث النتيجة عند انتهاء اللعبة
  const finishGame = useCallback(
    (reason: string, winner: 'white' | 'black' | 'draw') => {
      const result: 'win' | 'loss' | 'draw' =
        config.mode === 'local'
          ? winner === 'draw'
            ? 'draw'
            : 'win'
          : winner === 'draw'
            ? 'draw'
            : (winner === 'white' ? 'w' : 'b') === playerColor
              ? 'win'
              : 'loss'

      let aiComment: string | undefined
      if (isAI) {
        if (result === 'win') {
          aiComment =
            reason === 'resign'
              ? pick(AI_EDGE_COMMENTS.playerResigned)
              : reason === 'timeout'
                ? pick(AI_EDGE_COMMENTS.playerTimedOut)
                : undefined // كش مات: يأتي الرد من /api/ai/comment
        } else if (result === 'loss' && reason === 'timeout') {
          aiComment = pick(AI_EDGE_COMMENTS.aiTimedOut)
        }
      }

      setGameOver({ result, reason, aiComment })
      setDialogOpen(true)

      // أصوات النهاية
      if (config.mode === 'local') sfx.win()
      else if (result === 'win') sfx.win()
      else if (result === 'loss') sfx.lose()
      else sfx.draw()

      // تسجيل النتيجة مرة واحدة
      if (!recordedRef.current) {
        recordedRef.current = true
        const moves = chessRef.current.history().length
        const durationSec = Math.floor((Date.now() - startedAtRef.current) / 1000)
        const stats = recordGame({
          mode: config.mode,
          result: config.mode === 'local' ? (winner === 'draw' ? 'draw' : 'win') : result,
          opponent: isAI ? aiName : colorNameAr(winner === 'draw' ? 'white' : winner),
          difficulty: isAI ? config.difficulty : undefined,
          moves,
        })
        onStats(stats)

        void fetch('/api/stats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playerName: config.mode === 'local' ? `${whiteName} ضد ${blackName}` : playerName,
            mode: config.mode,
            result: config.mode === 'local' ? (winner === 'draw' ? 'draw' : 'win') : result,
            playerColor: winner === 'draw' ? 'white' : winner,
            aiLevel: isAI ? DIFFICULTY_LABEL[config.difficulty] : null,
            opponent: isAI ? aiName : colorNameAr(winner === 'draw' ? 'white' : winner),
            moves,
            durationSec,
          }),
        }).catch(() => {})
      }

      // تعليق الوزير على نهاية المباراة (رد فعل على آخر نقلة)
      if (isAI && reason !== 'resign' && reason !== 'timeout') {
        const history = chessRef.current.history({ verbose: true })
        const lastMove = history[history.length - 1]
        if (lastMove && lastMove.color === playerColor) {
          reactionAbortRef.current?.abort()
          const ac = new AbortController()
          reactionAbortRef.current = ac
          void fetch('/api/ai/comment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: ac.signal,
            body: JSON.stringify({
              fenBefore: lastMove.before,
              fenAfter: lastMove.after,
              san: lastMove.san,
              playerColor,
              playerName,
              isCapture: !!lastMove.captured,
              isCheck: lastMove.san.includes('+'),
              isMate: lastMove.san.includes('#'),
              force: true,
            }),
          })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (data?.comment) pushAiMessage(data.comment)
            })
            .catch(() => {})
        }
      }
    },
    [config, isAI, onStats, playerColor, playerName, pushAiMessage, whiteName, blackName],
  )

  // مرحباً باللاعب
  useEffect(() => {
    if (isAI) {
      pushAiMessage(`أهلاً بك يا ${playerName}! أنا الوزير، ساحر الرقعة الذهبي. لعبة نظيفة… وحظ أوفر لك، ستحتاجه. دقّة المستوى: ${DIFFICULTY_LABEL[config.difficulty]}.`)
    }
    return () => {
      reactionAbortRef.current?.abort()
    }
  }, [])

  // ساعة اللعبة
  useEffect(() => {
    if (!baseMs || !clocks || gameOver) return
    lastTickRef.current = Date.now()
    const iv = setInterval(() => {
      const now = Date.now()
      const elapsed = now - lastTickRef.current
      lastTickRef.current = now
      const chess = chessRef.current
      if (chess.isGameOver()) return
      setClocks((prev) => {
        if (!prev) return prev
        const turn = chess.turn()
        const nextMs = Math.max(0, prev[turn] - elapsed)
        if (nextMs <= 0) {
          const winner = turn === 'w' ? 'black' : 'white'
          setTimeout(() => finishGame('timeout', winner), 0)
        }
        return { ...prev, [turn]: nextMs }
      })
    }, 200)
    return () => clearInterval(iv)
  }, [baseMs, clocks !== null, gameOver, finishGame, fen])

  const playSounds = useCallback((san: string, captured: boolean) => {
    if (san.includes('#')) {
      sfx.capture()
      return
    }
    if (san.includes('+')) sfx.check()
    else if (san.includes('=') || san.includes('O-O')) sfx.castle()
    else if (captured) sfx.capture()
    else sfx.move()
  }, [])


  // طلب تعليق على نقلة اللاعب (fire-and-forget باحتمالية يقررها الخادم)
  const requestPlayerReaction = useCallback(
    (moveInfo: { before: string; after: string; san: string; captured?: string }) => {
      if (!isAI || !moveInfo) return
      reactionAbortRef.current?.abort()
      const ac = new AbortController()
      reactionAbortRef.current = ac
      void fetch('/api/ai/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ac.signal,
        body: JSON.stringify({
          fenBefore: moveInfo.before,
          fenAfter: moveInfo.after,
          san: moveInfo.san,
          playerColor,
          playerName,
          isCapture: !!moveInfo.captured,
          isCheck: moveInfo.san.includes('+'),
          isMate: moveInfo.san.includes('#'),
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.comment) {
            // تأخير بسيط ليعكس التفكير الطبيعي
            setTimeout(() => pushAiMessage(data.comment), 400 + Math.random() * 900)
          }
        })
        .catch(() => {})
    },
    [isAI, playerColor, playerName, pushAiMessage],
  )

  const applyMoveLocal = useCallback(
    (move: { from: string; to: string; promotion?: string }, aiComment: string | null) => {
      const chess = chessRef.current
      try {
        const applied = chess.move({ from: move.from, to: move.to, promotion: move.promotion || undefined })
        playSounds(applied.san, !!applied.captured)
        setFen(chess.fen())
        setSelected(null)

        if (aiComment) setTimeout(() => pushAiMessage(aiComment), 300)

        // فحص النهاية
        if (chess.isGameOver()) {
          if (chess.isCheckmate()) {
            const winner = chess.turn() === 'w' ? 'black' : 'white'
            finishGame('checkmate', winner)
          } else if (chess.isStalemate()) {
            finishGame('stalemate', 'draw')
          } else if (chess.isInsufficientMaterial()) {
            finishGame('insufficient_material', 'draw')
          } else if (chess.isThreefoldRepetition()) {
            finishGame('repetition', 'draw')
          } else {
            finishGame('fifty_move', 'draw')
          }
        } else if (isAI && applied.color === playerColor) {
          // رد فعل محتمل على نقلة اللاعب
          requestPlayerReaction({ before: applied.before, after: applied.after, san: applied.san, captured: applied.captured })
        }
      } catch {
        // نقلة غير قانونية - نتجاهل
      }
    },
    [finishGame, isAI, playerColor, playSounds, pushAiMessage, requestPlayerReaction],
  )

  // طلب نقلة الذكاء الاصطناعي
  useEffect(() => {
    if (!isAI || gameOver) return
    const chess = chessRef.current
    if (chess.turn() !== aiColor || chess.isGameOver()) return
    if (requestedFenRef.current === fen) return
    requestedFenRef.current = fen
    aiBusyRef.current = true
    setAiThinking(true)

    const controller = new AbortController()
    const historySan = chess.history()
    const moveNumber = Math.floor(historySan.length / 2) + 1

    const timeout = setTimeout(() => {
      // مهلة الشبكة: لعب نقلة احتياطية معقولة لضمان استمرارية اللعبة
      const moves = chess.moves({ verbose: true })
      if (moves.length > 0) {
        const caps = moves.filter((m) => m.captured)
        const central = moves.find((m) => ['d4', 'e4', 'd5', 'e5'].includes(m.to))
        const m = caps.length > 0 ? caps[Math.floor(Math.random() * caps.length)] : central || moves[Math.floor(Math.random() * Math.min(6, moves.length))]
        applyMoveLocal({ from: m.from, to: m.to, promotion: m.promotion }, 'أعذرني، تأخر اتصالي… لعبت سريعاً!')
      }
      setAiThinking(false)
      aiBusyRef.current = false
    }, 25000)

    // حساب المرشحين محلياً في المتصفح (بعد رسم واجهة التفكير) ثم إرسالهم للخادم
    // ليختار gemma4 النقلة الاستراتيجية ويكتب تعليقه — بهذا يعمل على الخطة المجانية في Cloudflare
    const computeTimer = setTimeout(() => {
      let candidates: { from: string; to: string; promotion?: string; san: string; score: number }[] = []
      try {
        const budget = ENGINE_BUDGET[config.difficulty]
        candidates = getRankedMoves(fen, budget.depth, 6, { maxNodes: budget.maxNodes, deadlineMs: budget.deadlineMs }).map((c) => ({
          from: c.from,
          to: c.to,
          promotion: c.promotion,
          san: c.san,
          score: c.score,
        }))
      } catch (e) {
        console.error('[ai-game] candidate computation failed', e)
      }

      void fetch('/api/ai/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          fen,
          difficulty: config.difficulty,
          historySan,
          playerColor,
          playerName,
          moveNumber,
          candidates,
        }),
      })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data) => {
        clearTimeout(timeout)
        if (!data?.move) throw new Error('bad response')
        const comment = typeof data.comment === 'string' && data.comment.trim() ? data.comment.trim() : null
        applyMoveLocal(data.move, comment)
        if (typeof data.evalCp === 'number') setEvalCp(data.evalCp)
      })
      .catch((e) => {
        clearTimeout(timeout)
        if (e?.name === 'AbortError') return
        console.error('[ai-game] AI move failed', e)
        // بدائل عند الفشل: نقلة من المحرك عبر القائمة الأولى
        const chess2 = chessRef.current
        const moves = chess2.moves({ verbose: true })
        if (moves.length > 0 && !chess2.isGameOver() && chess2.turn() === aiColor) {
          const m = moves[Math.floor(Math.random() * moves.length)]
          applyMoveLocal({ from: m.from, to: m.to, promotion: m.promotion }, 'اتصالي تأخر قليلاً… لنعد للمعركة!')
        }
      })
      .finally(() => {
        setAiThinking(false)
        aiBusyRef.current = false
      })
    }, 50) // مهلة قصيرة لرسم واجهة "يفكر…" قبل الحساب الثقيل في المتصفح

    return () => {
      clearTimeout(computeTimer)
      clearTimeout(timeout)
      controller.abort()
    }
  }, [fen, gameOver, isAI, aiColor])

  const legalTargets = useMemo(() => {
    const map = new Map<string, boolean>()
    if (!selected) return map
    const chess = chessRef.current
    for (const m of chess.moves({ square: selected as never, verbose: true })) {
      map.set(m.to, !!m.captured)
    }
    return map
  }, [selected, fen])

  const needsPromotion = (from: string, to: string): boolean => {
    const chess = chessRef.current
    const piece = chess.get(from as never)
    if (!piece || piece.type !== 'p') return false
    return (piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1')
  }

  const handleSquareClick = useCallback(
    (square: string) => {
      if (gameOver || pendingPromotion) return
      const chess = chessRef.current
      const turn = chess.turn()
      const myTurn =
        config.mode === 'local' ? true : turn === playerColor
      if (!myTurn || chess.isGameOver()) return
      if (isAI && aiThinking) return

      const piece = chess.get(square as never)

      if (selected) {
        if (legalTargets.has(square)) {
          if (needsPromotion(selected, square)) {
            setPendingPromotion({ from: selected, to: square })
            return
          }
          applyMoveLocal({ from: selected, to: square }, null)
          return
        }
        if (piece && piece.color === turn) {
          setSelected(square)
          sfx.select()
          return
        }
        setSelected(null)
        return
      }

      if (piece && piece.color === turn) {
        setSelected(square)
        sfx.select()
      }
    },
    [gameOver, pendingPromotion, selected, legalTargets, playerColor, config.mode, aiThinking, applyMoveLocal],
  )

  const handleDropMove = useCallback(
    (from: string, to: string) => {
      if (gameOver || pendingPromotion) return
      const chess = chessRef.current
      const turn = chess.turn()
      if (config.mode !== 'local' && turn !== playerColor) return
      if (legalTargets.has(to) && from === selected) {
        if (needsPromotion(from, to)) {
          setPendingPromotion({ from, to })
          return
        }
        applyMoveLocal({ from, to }, null)
      }
    },
    [gameOver, pendingPromotion, selected, legalTargets, playerColor, config.mode, applyMoveLocal],
  )

  const undo = useCallback(() => {
    if (aiThinking || gameOver) return
    const chess = chessRef.current
    if (chess.history().length === 0) return
    if (isAI) {
      // تراجع عن نقلة الوزير + نقلة اللاعب
      const turn = chess.turn()
      chess.undo()
      if (turn === playerColor) chess.undo()
    } else {
      chess.undo()
    }
    requestedFenRef.current = null
    setGameOver(null)
    setDialogOpen(false)
    setSelected(null)
    setFen(chess.fen())
    sfx.move()
  }, [aiThinking, gameOver, isAI, playerColor])

  const resign = useCallback(() => {
    if (gameOver) return
    if (isAI) {
      pushAiMessage(pick(AI_EDGE_COMMENTS.playerResigned))
      finishGame('resign', playerColor === 'w' ? 'black' : 'white')
    } else {
      finishGame('resign', chessRef.current.turn() === 'w' ? 'black' : 'white')
    }
  }, [gameOver, isAI, finishGame, playerColor, pushAiMessage])

  const newGame = useCallback(() => {
    chessRef.current = new Chess()
    requestedFenRef.current = null
    recordedRef.current = false
    startedAtRef.current = Date.now()
    setGameOver(null)
    setDialogOpen(false)
    setSelected(null)
    setPendingPromotion(null)
    setEvalCp(null)
    setAiMessages([])
    setClocks(baseMs ? { w: baseMs, b: baseMs } : null)
    setFen(chessRef.current.fen())
    if (isAI) {
      pushAiMessage(`مباراة جديدة! لنتطمس آثار الماضي ونبدأ صفحة بيضاء… أرجو أن تكون البيضاء هذه المرة.`)
    }
  }, [baseMs, isAI, pushAiMessage])

  // ===== عرض البطاقات =====
  const lead = materialDiff(view.captured.w, view.captured.b)
  const orientation: 'white' | 'black' =
    config.mode === 'local' ? (flip ? 'black' : 'white') : config.playerColor

  const bottomColor: 'w' | 'b' = orientation === 'white' ? 'w' : 'b'
  const topColor: 'w' | 'b' = bottomColor === 'w' ? 'b' : 'w'

  const cardFor = (c: 'w' | 'b'): PlayerCardData => {
    const isPlayer = config.mode === 'local' ? false : c === playerColor
    const name = c === 'w' ? whiteName : blackName
    return {
      name,
      color: c,
      isTurn: view.turn === c && !gameOver,
      capturedPieces: view.captured[c],
      materialLead: c === 'w' ? Math.max(0, lead) : Math.max(0, -lead),
      clockMs: clocks ? clocks[c] : null,
      clockActive: !gameOver && view.turn === c && (view.sanHistory.length > 0 || !!clocks),
      isAI: isAI && !isPlayer,
      connected: true,
      thinkBadge: isAI && aiThinking && view.turn === aiColor ? 'يفكر…' : null,
    }
  }

  const myTurn = config.mode === 'local' ? true : view.turn === playerColor
  const interactive = !gameOver && !pendingPromotion && (config.mode === 'local' ? true : myTurn && !aiThinking)
  const movableColor: 'w' | 'b' | 'both' = config.mode === 'local' ? 'both' : playerColor

  const statusText = gameOver
    ? config.mode === 'local'
      ? 'انتهت المباراة'
      : gameOver.result === 'win'
        ? 'لقد فزت!'
        : gameOver.result === 'loss'
          ? 'خسرت المباراة'
          : 'تعادل'
    : config.mode === 'local'
      ? `دور ${colorNameAr(view.turn)}`
      : myTurn
        ? 'دورك — حرّك قطعك'
        : 'الوزير يفكر…'

  const statusSub = gameOver
    ? null
    : view.checkSquare
      ? 'كش! احمِ ملكك'
      : myTurn
        ? `${view.sanHistory.length} نقلة حتى الآن`
        : null

  const actions: ActionButtonDesc[] = [
    { label: 'تراجع', onClick: undo, disabled: gameOver || aiThinking || view.sanHistory.length === 0 },
    { label: 'استسلام', onClick: resign, variant: 'destructive', disabled: !!gameOver },
    { label: 'مباراة جديدة', onClick: newGame },
    ...(config.mode === 'local'
      ? [{ label: orientation === 'white' ? 'قلب الرقعة' : 'إعادة الرقعة', onClick: () => setFlip((f) => !f) }]
      : []),
    { label: 'القائمة الرئيسية', onClick: onExit },
  ]

  // عنوان الحوار للعب المحلي غير مستخدم - الحوار يعرضه winnerName

  return (
    <>
      <GameShell
      mode={config.mode}
      topCard={cardFor(topColor)}
      bottomCard={cardFor(bottomColor)}
      board={view.board}
      orientation={orientation}
      selected={selected}
      legalTargets={legalTargets}
      lastMove={view.lastMove}
      checkSquare={view.checkSquare}
      interactive={interactive}
      movableColor={movableColor}
      onSquareClick={handleSquareClick}
      onDropMove={handleDropMove}
      showEval={isAI}
      evalCp={evalCp}
      statusText={statusText}
      statusSub={statusSub}
      aiMessages={aiMessages}
      aiThinking={aiThinking}
      aiDifficultyLabel={isAI ? DIFFICULTY_LABEL[config.difficulty] : 'لعب محلي'}
      aiModelLabel={isAI ? AI_MODEL_LABEL : 'لاعبان على جهاز واحد'}
      actions={actions}
      footerNote={
        isAI ? (
          <span>
            يلعب الوزير بدمج محرك تحليل محلي مع النموذج اللغوي — يعلّق أحياناً لا دائماً!
          </span>
        ) : (
          <span>التقليد: انقر القطعة ثم المربع الهدف، أو اسحب القطعة مباشرة.</span>
        )
      }
    />

      <PromotionDialog
        open={!!pendingPromotion}
        color={view.turn}
        onChoose={(p) => {
          const pp = pendingPromotion
          setPendingPromotion(null)
          if (pp) applyMoveLocal({ from: pp.from, to: pp.to, promotion: p }, null)
        }}
        onCancel={() => setPendingPromotion(null)}
      />

      <GameOverDialog
        open={dialogOpen}
        result={gameOver?.result ?? 'draw'}
        reason={gameOver?.reason ?? null}
        winnerName={gameOver && gameOver.reason === 'checkmate' ? colorNameAr(view.turn === 'w' ? 'b' : 'w') : null}
        aiComment={gameOver?.aiComment}
        onRematch={newGame}
        onExit={onExit}
        canRematch
      />
    </>
  )
}
