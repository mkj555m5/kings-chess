// واجهة لعبة سوبر المزاد (كلاسيك / برو ماكس) — كل الحالة تُدار من الخادم
import { bidMe, createAuction, getAuction, tickAuction, type AuctionSession } from '@/lib/kingdom-engine'
import { cleanTgId, cleanName, jsonError } from '@/lib/kingdom-server'

function publicState(s: AuctionSession) {
  return {
    id: s.id,
    mode: s.mode,
    budget: s.budget,
    spent: s.spent,
    rivalBudget: s.rivalBudget,
    rivalSpent: s.rivalSpent,
    rivalName: s.rivalName,
    aiPersona: s.aiPersona,
    mySquad: s.mySquad,
    rivalSquad: s.rivalSquad,
    round: s.round,
    totalRounds: s.totalRounds,
    phase: s.phase,
    current: s.current,
    roundPos: s.roundPosLabel || null,
    price: s.price,
    leader: s.leader,
    deadlineMs: s.deadlineMs,
    log: s.log.slice(-14),
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: string
      sessionId?: string
      mode?: string
      tgId?: string
      name?: string
      inc?: number
    }
    const tgId = cleanTgId(body.tgId)
    if (!tgId) return jsonError('سجّل دخول عبر تلجرام أولاً')

    if (body.action === 'create') {
      const mode = body.mode === 'promax' ? 'promax' : 'classic'
      const s = createAuction(mode, { tgId, name: cleanName(body.name) || 'لاعب' })
      return Response.json({ ok: true, state: publicState(s) })
    }

    const s = getAuction(String(body.sessionId || ''))
    if (!s) return jsonError('الجلسة غير موجودة أو انتهت — ابدأ لعبة جديدة', 404)
    if (s.phase !== 'bidding') return Response.json({ ok: true, state: publicState(s) })

    if (body.action === 'bid') {
      tickAuction(s)
      const okBid = bidMe(s, Number(body.inc) || 1)
      if (!okBid) return Response.json({ ok: false, error: 'لا يمكنك المزايدة الآن (ميزانية أو لحظة غير مناسبة)', state: publicState(s) })
      tickAuction(s)
      return Response.json({ ok: true, state: publicState(s) })
    }

    if (body.action === 'state') {
      tickAuction(s)
      return Response.json({ ok: true, state: publicState(s) })
    }

    return jsonError('إجراء غير معروف')
  } catch {
    return jsonError('خطأ في الخادم', 500)
  }
}
