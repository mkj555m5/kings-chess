// معلومات حسابي في المملكة: نقاط، تصنيف، تحقق تلجرام، صورة
import { db } from '@/lib/db'
import { cleanTgId, cleanName, ensureUser, jsonError } from '@/lib/kingdom-server'
import { rankFor } from '@/lib/cards-data'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const tgId = cleanTgId(url.searchParams.get('tgId'))
  if (!tgId) return jsonError('معرف تلجرام غير صالح')
  try {
    const user = await ensureUser(tgId, url.searchParams.get('name') || undefined)
    if (!user) return jsonError('المستخدم غير موجود', 404)
    const rankPos = await db.telegramUser.count({ where: { points: { gt: user.points } } })
    return Response.json({
      ok: true,
      user: {
        telegramId: user.telegramId,
        displayName: user.displayName,
        username: user.username,
        isOwner: user.isOwner,
        points: user.points,
        avatarUrl: user.avatarUrl,
        verified: true, // الدخول دائماً عبر توقيع تلجرام الموثق
        rank: rankFor(user.points),
        rankPos: rankPos + 1,
      },
    })
  } catch {
    return jsonError('خطأ في الخادم', 500)
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { tgId?: string; displayName?: string }
    const tgId = cleanTgId(body.tgId)
    if (!tgId) return jsonError('معرف تلجرام غير صالح')
    const user = await ensureUser(tgId)
    if (!user) return jsonError('المستخدم غير موجود', 404)
    const displayName = cleanName(body.displayName)
    if (displayName) {
      await db.telegramUser.update({ where: { id: user.id }, data: { displayName } })
    }
    return Response.json({ ok: true })
  } catch {
    return jsonError('خطأ في الخادم', 500)
  }
}
