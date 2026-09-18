// واجهة لعبة اللاعب المجهول — بطاقة ظاهرة وبطاقة سوداء، الخادم يدير الأدوار
import { createMystery, getMystery, resolveMysteryPick, tickMystery, type MysterySession } from '@/lib/kingdom-engine'
import { cleanTgId, cleanName, jsonError } from '@/lib/kingdom-server'

function publicState(s: MysterySession, hideMystery = true) {
  return {
    id: s.id,
    round: s.round,
    totalRounds: 6,
    turn: s.turn,
    phase: s.phase,
    visible: s.visibleId,
    // هوية الكرت المجهول تُخفى حتى يحسم الاختيار (لعبة عادلة)
    mystery: hideMystery && s.phase === 'picking' && s.visibleId ? 'hidden' : s.mysteryId,
    mySquad: s.mySquad,
    rivalSquad: s.rivalSquad,
    poolCount: s.pool.length,
    log: s.log.slice(-8),
    aiPersona: s.aiPersona,
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action?: string; sessionId?: string; tgId?: string; name?: string; choice?: string }
    const tgId = cleanTgId(body.tgId)
    if (!tgId) return jsonError('سجّل دخول عبر تلجرام أولاً')

    if (body.action === 'create') {
      const s = createMystery({ tgId, name: cleanName(body.name) || 'لاعب' })
      return Response.json({ ok: true, state: publicState(s) })
    }

    const s = getMystery(String(body.sessionId || ''))
    if (!s) return jsonError('الجلسة غير موجودة أو انتهت — ابدأ لعبة جديدة', 404)

    if (body.action === 'pick') {
      if (s.phase !== 'picking' || s.turn !== 'me') return Response.json({ ok: false, error: 'ليس دورك الآن', state: publicState(s) })
      const choice = body.choice === 'mystery' ? 'mystery' : 'visible'
      // كشف الكرت المجهول قبل الحسم لإظهار النتيجة
      resolveMysteryPick(s, 'me', choice)
      return Response.json({ ok: true, state: publicState(s, false) })
    }

    if (body.action === 'state') {
      tickMystery(s)
      return Response.json({ ok: true, state: publicState(s) })
    }

    return jsonError('إجراء غير معروف')
  } catch {
    return jsonError('خطأ في الخادم', 500)
  }
}
