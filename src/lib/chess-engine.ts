import { Chess, type Move } from 'chess.js'

// ===== محرك شطرنج minimax مع تقليم alpha-beta =====
// يستخدم على الخادم في مسار /api/ai/move

const PIECE_VALUE: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
}

// جداول مواقع القطع (نسخة مبسطة - Tomasz Michniewski)
// الفهارس من منظور الأبيض، الصف 8 أولاً (a8..h8)
const PST_PAWN = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
]
const PST_KNIGHT = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
]
const PST_BISHOP = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
]
const PST_ROOK = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
]
const PST_QUEEN = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
]
const PST_KING_MID = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
]
const PST_KING_END = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
]

const PST: Record<string, number[]> = {
  p: PST_PAWN,
  n: PST_KNIGHT,
  b: PST_BISHOP,
  r: PST_ROOK,
  q: PST_QUEEN,
  k: PST_KING_MID,
}

// مربع -> فهرس الجدول (0 = a8 ... 63 = h1)
function squareIndex(square: string): number {
  const file = square.charCodeAt(0) - 97 // a=0
  const rank = 8 - parseInt(square[1], 10) // rank8 -> 0
  return rank * 8 + file
}

// فهرس القطع السوداء: قلب الجدول عمودياً ليتطابق التقييم
function blackSquareIndex(square: string): number {
  const file = square.charCodeAt(0) - 97
  const rank = parseInt(square[1], 10) - 1 // rank1 -> 0
  return rank * 8 + file
}

const MATE_SCORE = 100000

interface EvalContext {
  nodes: number
  maxNodes: number
  aborted: boolean
}

// تقييم ثابت للوضعية (من منظور من عليه الدور: موجب = جيد لصاحب الدور)
function evaluate(chess: Chess, ctx: EvalContext): number {
  ctx.nodes++
  if (ctx.nodes > ctx.maxNodes) ctx.aborted = true
  if (chess.isCheckmate()) return -MATE_SCORE
  if (chess.isDraw() || chess.isStalemate()) return 0

  const board = chess.board()
  let whiteScore = 0
  let blackScore = 0
  let material = 0
  const pieces: { type: string; color: string; square: string }[] = []

  for (const row of board) {
    for (const sq of row) {
      if (!sq) continue
      pieces.push({ type: sq.type, color: sq.color, square: sq.square })
      material += PIECE_VALUE[sq.type]
    }
  }

  const endgame = material < 2600 // ملك+قليلة => نهاية لعبة
  for (const p of pieces) {
    const table = p.type === 'k' && endgame ? PST_KING_END : PST[p.type]
    const idx = p.color === 'w' ? squareIndex(p.square) : blackSquareIndex(p.square)
    const val = PIECE_VALUE[p.type] + table[idx]
    if (p.color === 'w') whiteScore += val
    else blackScore += val
  }

  // حافز دفع للتحويل في النهايات
  const turn = chess.turn()
  const raw = whiteScore - blackScore
  return turn === 'w' ? raw : -raw
}

function moveOrderScore(m: Move): number {
  let s = 0
  if (m.captured) s += 10 * PIECE_VALUE[m.captured] - PIECE_VALUE[m.piece]
  if (m.promotion) s += PIECE_VALUE[m.promotion]
  if (m.san.includes('+')) s += 50
  return s
}

function orderedMoves(chess: Chess): Move[] {
  const moves = chess.moves({ verbose: true }) as Move[]
  return moves.sort((a, b) => moveOrderScore(b) - moveOrderScore(a))
}

// بحث كيشوتية محدود للأسر فقط لاستقرار التقييم
function quiescence(chess: Chess, alpha: number, beta: number, ctx: EvalContext, qDepth: number): number {
  const standPat = evaluate(chess, ctx)
  if (ctx.aborted) return standPat
  if (qDepth <= 0) return standPat
  if (standPat >= beta) return beta
  if (standPat > alpha) alpha = standPat

  const caps = (chess.moves({ verbose: true }) as Move[]).filter((m) => m.captured || m.promotion)
  caps.sort((a, b) => moveOrderScore(b) - moveOrderScore(a))

  for (const m of caps) {
    chess.move({ from: m.from, to: m.to, promotion: m.promotion })
    const score = -quiescence(chess, -beta, -alpha, ctx, qDepth - 1)
    chess.undo()
    if (ctx.aborted) return alpha
    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }
  return alpha
}

function negamax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  ctx: EvalContext,
  useQuiescence: boolean,
): number {
  if (ctx.aborted) return evaluate(chess, ctx)
  if (chess.isCheckmate()) return -MATE_SCORE + (10 - depth)
  if (chess.isDraw() || chess.isStalemate()) return 0
  if (depth <= 0) return useQuiescence ? quiescence(chess, alpha, beta, ctx, 3) : evaluate(chess, ctx)

  const moves = orderedMoves(chess)
  let best = -Infinity
  for (const m of moves) {
    chess.move({ from: m.from, to: m.to, promotion: m.promotion })
    const score = -negamax(chess, depth - 1, -beta, -alpha, ctx, useQuiescence)
    chess.undo()
    if (ctx.aborted) break
    if (score > best) best = score
    if (best > alpha) alpha = best
    if (alpha >= beta) break // تقليم
  }
  return best === -Infinity ? evaluate(chess, ctx) : best
}

export interface RankedMove {
  san: string
  from: string
  to: string
  promotion?: string
  captured?: string
  isCheck: boolean
  score: number // من منظور من عليه الدور
}

// ترتيب أفضل N حركة من وضعية معينة
export function getRankedMoves(fen: string, depth: number, topN = 5, opts?: { maxNodes?: number; deadlineMs?: number }): RankedMove[] {
  const chess = new Chess(fen)
  const ctx: EvalContext = {
    nodes: 0,
    maxNodes: opts?.maxNodes ?? 90000,
    aborted: false,
  }
  const deadline = opts?.deadlineMs ? Date.now() + opts.deadlineMs : undefined
  const moves = orderedMoves(chess)
  const scored: RankedMove[] = []

  for (const m of moves) {
    if (deadline && Date.now() > deadline) {
      ctx.aborted = true
    }
    chess.move({ from: m.from, to: m.to, promotion: m.promotion })
    const score = ctx.aborted ? evaluate(chess, ctx) : -negamax(chess, depth - 1, -Infinity, Infinity, ctx, depth >= 2)
    chess.undo()
    scored.push({
      san: m.san,
      from: m.from,
      to: m.to,
      promotion: m.promotion,
      captured: m.captured,
      isCheck: m.san.includes('+') || m.san.includes('#'),
      score,
    })
    if (ctx.aborted && deadline && Date.now() > deadline) break
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topN)
}

// أفضل حركة مباشرة
export function bestMove(fen: string, depth: number): RankedMove | null {
  const ranked = getRankedMoves(fen, depth, 1)
  return ranked[0] ?? null
}

// تقييم وضعية بعمق قليل (لاكتشاف الأخطاء الكبيرة)
export function quickEval(fen: string): number {
  // يعيد التقييم من منظور الأبيض بالسنتيبون
  const chess = new Chess(fen)
  if (chess.isCheckmate()) return chess.turn() === 'w' ? -MATE_SCORE : MATE_SCORE
  if (chess.isDraw()) return 0
  const ctx: EvalContext = { nodes: 0, maxNodes: 5000, aborted: false }
  const side = chess.turn()
  const score = negamax(chess, 1, -Infinity, Infinity, ctx, false)
  return side === 'w' ? score : -score
}
