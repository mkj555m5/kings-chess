// أدوات مشتركة لمنطق اللعبة (تعمل على العميل)
import { type Chess } from 'chess.js'
import type { PieceColor, TimeControl } from './game-types'

export interface BoardPiece {
  square: string
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
  color: 'w' | 'b'
}

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
export const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1']

export function squareToXY(square: string): { x: number; y: number } {
  return { x: FILES.indexOf(square[0]), y: RANKS.indexOf(square[1]) }
}

export function xyToSquare(x: number, y: number): string {
  return FILES[x] + RANKS[y]
}

// أسماء نقلات بالعربية المبسطة
export function reasonToAr(reason: string | null): string {
  switch (reason) {
    case 'checkmate':
      return 'كش مات'
    case 'timeout':
      return 'انتهاء الوقت'
    case 'resign':
      return 'استسلام'
    case 'stalemate':
      return 'طريق مسدود'
    case 'insufficient_material':
      return 'قطع غير كافية للفوز'
    case 'repetition':
      return 'تكرار الوضعية ثلاثاً'
    case 'fifty_move':
      return 'قاعدة الخمسين نقلة'
    case 'agreement':
      return 'اتفاق على التعادل'
    default:
      return 'نهاية المباراة'
  }
}

export const PIECE_VALUE_CP: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }

// فرق المواد بين اللاعبين (موجب = تأهل للأبيض)
export function materialDiff(capturedByWhite: string[], capturedByBlack: string[]): number {
  const sum = (arr: string[]) => arr.reduce((acc, p) => acc + (PIECE_VALUE_CP[p] || 0), 0)
  return sum(capturedByWhite) - sum(capturedByBlack)
}

// تحويل تقييم المحرك إلى نسبة فوز للأبيض
export function evalToWhitePercent(cp: number): number {
  const clamped = Math.max(-1500, Math.min(1500, cp))
  return Math.round(100 * (1 / (1 + Math.pow(10, -clamped / 400))))
}

export function formatClock(ms: number): string {
  if (ms < 0) ms = 0
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  if (ms < 20000) {
    const tenth = Math.floor((ms % 1000) / 100)
    return `${m}:${String(s).padStart(2, '0')}.${tenth}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

export function timeControlMs(tc: TimeControl): number | null {
  switch (tc) {
    case 'blitz3':
      return 180000
    case 'blitz5':
      return 300000
    case 'rapid10':
      return 600000
    default:
      return null
  }
}

export function colorNameAr(c: PieceColor | 'white' | 'black'): string {
  const v = c as string
  return v === 'w' || v === 'white' ? 'الأبيض' : 'الأسود'
}

export function randomColor(): 'white' | 'black' {
  return Math.random() < 0.5 ? 'white' : 'black'
}

// مشتقات العرض من كائن Chess
export function findCheckSquare(chess: Chess): string | null {
  if (!chess.isCheck()) return null
  const turn = chess.turn()
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.type === 'k' && sq.color === turn) return sq.square
    }
  }
  return null
}

export function deriveView(chess: Chess) {
  const verbose = chess.history({ verbose: true })
  const last = verbose[verbose.length - 1] ?? null
  return {
    board: chess.board(),
    turn: chess.turn(),
    lastMove: last ? { from: last.from, to: last.to, san: last.san } : null,
    sanHistory: chess.history(),
    captured: {
      w: verbose.filter((m) => m.color === 'w' && m.captured).map((m) => m.captured as string),
      b: verbose.filter((m) => m.color === 'b' && m.captured).map((m) => m.captured as string),
    },
    checkSquare: findCheckSquare(chess),
    isOver: chess.isGameOver(),
  }
}
