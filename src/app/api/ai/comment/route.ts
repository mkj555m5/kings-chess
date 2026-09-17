import { NextRequest, NextResponse } from 'next/server'
import { getPlayerMoveReaction, shouldAIReactToPlayer, quickEval } from '@/lib/ai-brain'
import type { AICommentResponse, PieceColor } from '@/lib/game-types'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const fenBefore = typeof body.fenBefore === 'string' ? body.fenBefore : ''
    const fenAfter = typeof body.fenAfter === 'string' ? body.fenAfter : ''
    const san = typeof body.san === 'string' ? body.san : ''
    const playerColor: PieceColor = body.playerColor === 'b' ? 'b' : 'w'
    const playerName = typeof body.playerName === 'string' && body.playerName.trim() ? body.playerName.trim().slice(0, 30) : 'الخصم'
    const isCapture = !!body.isCapture
    const isCheck = !!body.isCheck
    const isMate = !!body.isMate
    const force = !!body.force
    const aiColor: PieceColor = playerColor === 'w' ? 'b' : 'w'

    if (!san || !fenBefore || !fenAfter) {
      return NextResponse.json({ comment: null } satisfies AICommentResponse)
    }

    // تقييم تأثير نقلة اللاعب من وجهة نظر الذكاء الاصطناعي
    // (قد يأتي محسوباً من متصفح اللاعب في وضع Cloudflare منخفض CPU)
    let evalSwingCp = 0
    if (typeof body.evalSwingCp === 'number' && Number.isFinite(body.evalSwingCp)) {
      evalSwingCp = Math.max(-5000, Math.min(5000, Math.round(body.evalSwingCp)))
    } else {
      try {
        const beforeW = quickEval(fenBefore) // من منظور الأبيض
        const afterW = quickEval(fenAfter)
        const beforeAI = aiColor === 'w' ? beforeW : -beforeW
        const afterAI = aiColor === 'w' ? afterW : -afterW
        evalSwingCp = afterAI - beforeAI
      } catch {
        evalSwingCp = 0
      }
    }

    // الوزير لا يعلق في كل مرة - قرارات احتمالية
    const should = force || shouldAIReactToPlayer({ isCapture, isCheck, isMate, evalSwingCp })
    if (!should) return NextResponse.json({ comment: null } satisfies AICommentResponse)

    const comment = await getPlayerMoveReaction({
      fenBefore,
      fenAfter,
      san,
      playerColor,
      playerName,
      isCapture,
      isCheck,
      isMate,
      evalSwingCp,
    })

    return NextResponse.json({ comment } satisfies AICommentResponse)
  } catch (e) {
    console.error('[api/ai/comment] error:', e)
    return NextResponse.json({ comment: null } satisfies AICommentResponse)
  }
}
