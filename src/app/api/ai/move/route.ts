import { NextRequest, NextResponse } from 'next/server'
import { Chess } from 'chess.js'
import { getAIMoveWithComment, quickEval } from '@/lib/ai-brain'
import type { AIMoveResponse, Difficulty, PieceColor } from '@/lib/game-types'

export const maxDuration = 30

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const fen = typeof body.fen === 'string' ? body.fen : ''
    const difficulty: Difficulty = DIFFICULTIES.includes(body.difficulty) ? body.difficulty : 'medium'
    const historySan: string[] = Array.isArray(body.historySan) ? body.historySan.slice(-40) : []
    const playerColor: PieceColor = body.playerColor === 'b' ? 'b' : 'w'
    const playerName: string = typeof body.playerName === 'string' && body.playerName.trim() ? body.playerName.trim().slice(0, 30) : 'الخصم'
    const moveNumber: number = typeof body.moveNumber === 'number' ? body.moveNumber : 1

    const chess = new Chess(fen)
    if (chess.isGameOver()) {
      return NextResponse.json({ error: 'اللعبة انتهت بالفعل' }, { status: 400 })
    }

    // مرشحون محسوبون في متصفح اللاعب (مسار Cloudflare منخفض CPU) — تحقق من صلاحيتهم قبل الاستخدام
    const candidates = Array.isArray(body.candidates)
      ? body.candidates
          .slice(0, 8)
          .filter(
            (c: unknown): c is { from: string; to: string; promotion?: string; san: string; score: number } =>
              !!c && typeof c === 'object' &&
              typeof (c as Record<string, unknown>).from === 'string' &&
              typeof (c as Record<string, unknown>).to === 'string' &&
              typeof (c as Record<string, unknown>).san === 'string' &&
              typeof (c as Record<string, unknown>).score === 'number' &&
              Number.isFinite((c as Record<string, unknown>).score as number),
          )
          .map((c: { from: string; to: string; promotion?: string; san: string; score: number }) => ({
            from: String(c.from).slice(0, 2),
            to: String(c.to).slice(0, 2),
            promotion: typeof c.promotion === 'string' && /^[qrbn]$/.test(c.promotion) ? c.promotion : undefined,
            san: String(c.san).slice(0, 12),
            score: Math.max(-20000, Math.min(20000, Math.round(c.score))),
          }))
          .filter((c: { from: string; to: string }) => {
            try {
              const ok = !!chess.move({ from: c.from, to: c.to, promotion: c.promotion })
              if (ok) chess.undo() // تحقق فقط - أعد اللوحة لوضعها
              return ok
            } catch {
              return false
            }
          })
          .map((c: { from: string; to: string; promotion?: string }) => ({ ...c }))
      : undefined

    const result = await getAIMoveWithComment({
      fen,
      difficulty,
      historySan,
      playerColor,
      playerName,
      moveNumber,
      candidates,
    })

    // طبّق النقلة لحساب التقييم بعد الحركة
    const after = new Chess(fen)
    const applied = after.move({ from: result.move.from, to: result.move.to, promotion: result.move.promotion })
    const evalCp = quickEval(after.fen())

    const response: AIMoveResponse = {
      move: { from: applied.from, to: applied.to, promotion: applied.promotion, san: applied.san },
      comment: result.comment,
      evalCp,
      meta: {
        isCapture: !!applied.captured,
        isCheck: after.isCheck(),
        isMate: after.isCheckmate(),
        source: result.source,
      },
    }
    return NextResponse.json(response)
  } catch (e) {
    console.error('[api/ai/move] error:', e)
    return NextResponse.json({ error: 'تعذر حساب نقلة الذكاء الاصطناعي' }, { status: 500 })
  }
}
