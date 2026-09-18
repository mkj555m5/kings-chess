// محاكاة مباراة بين تشكيلتين (مُدارة من الخادم — لا يمكن التلاعب بها)
import { simulateMatch } from '@/lib/match-engine'
import { CARD_BY_ID } from '@/lib/cards-data'
import { jsonError } from '@/lib/kingdom-server'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { home?: string[]; away?: string[] }
    const home = (body.home || []).map((id) => CARD_BY_ID.get(id)).filter(Boolean).slice(0, 14)
    const away = (body.away || []).map((id) => CARD_BY_ID.get(id)).filter(Boolean).slice(0, 14)
    if (home.length < 3 || away.length < 3) return jsonError('التشكيلتان غير مكتملتين')
    const match = simulateMatch(home as never[], away as never[])
    return Response.json({ ok: true, match })
  } catch {
    return jsonError('خطأ في الخادم', 500)
  }
}
