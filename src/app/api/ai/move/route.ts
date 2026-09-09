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

    const result = await getAIMoveWithComment({
      fen,
      difficulty,
      historySan,
      playerColor,
      playerName,
      moveNumber,
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
