// لوحة تحكم المالك (من الموقع): أكواد الشحن، المستخدمون، النقاط، الإحصائيات
import { db } from '@/lib/db'
import { awardPoints, cleanTgId, isOwner, jsonError } from '@/lib/kingdom-server'

function genCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const seg = (n: number) => Array.from({ length: n }, () => A[Math.floor(Math.random() * A.length)]).join('')
  return `KING-${seg(4)}-${seg(4)}`
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const tgId = cleanTgId(url.searchParams.get('tgId'))
    if (!tgId || !(await isOwner(tgId))) return jsonError('لوحة المالك للمالك فقط', 403)
    const [codes, userCount, matchCount, topUsers, pointsSum] = await Promise.all([
      db.redeemCode.findMany({ orderBy: { createdAt: 'desc' }, take: 30, include: { redemptions: { select: { telegramId: true } } } }),
      db.telegramUser.count(),
      db.kingdomMatch.count(),
      db.telegramUser.findMany({ orderBy: { points: 'desc' }, take: 15, select: { telegramId: true, displayName: true, username: true, points: true, avatarUrl: true, isOwner: true, lastSeenAt: true } }),
      db.telegramUser.aggregate({ _sum: { points: true } }),
    ])
    return Response.json({
      ok: true,
      stats: { users: userCount, matches: matchCount, points: pointsSum._sum.points || 0 },
      codes: codes.map((c) => ({ id: c.id, code: c.code, points: c.points, maxUses: c.maxUses, uses: c.uses, active: c.active, note: c.note, redemptions: c.redemptions.length, createdAt: c.createdAt })),
      users: topUsers,
    })
  } catch {
    return jsonError('خطأ في الخادم', 500)
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { tgId?: string; action?: string; code?: string; points?: number; maxUses?: number; note?: string; target?: string; delta?: number }
    const tgId = cleanTgId(body.tgId)
    if (!tgId || !(await isOwner(tgId))) return jsonError('لوحة المالك للمالك فقط', 403)
    const action = String(body.action || '')

    if (action === 'create-code') {
      const points = Math.max(1, Math.min(10000, Number(body.points) || 50))
      const maxUses = Math.max(1, Math.min(5000, Number(body.maxUses) || 1))
      const code = (String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24)) || genCode()
      const exists = await db.redeemCode.findUnique({ where: { code } })
      if (exists) return jsonError('هذا الكود موجود بالفعل')
      const rec = await db.redeemCode.create({ data: { code, points, maxUses, note: String(body.note || '').slice(0, 80), createdBy: tgId } })
      return Response.json({ ok: true, code: rec })
    }

    if (action === 'toggle-code') {
      const code = String(body.code || '').trim().toUpperCase()
      const rec = await db.redeemCode.findUnique({ where: { code } })
      if (!rec) return jsonError('الكود غير موجود', 404)
      await db.redeemCode.update({ where: { id: rec.id }, data: { active: !rec.active } })
      return Response.json({ ok: true, active: !rec.active })
    }

    if (action === 'delete-code') {
      const code = String(body.code || '').trim().toUpperCase()
      const rec = await db.redeemCode.findUnique({ where: { code } })
      if (!rec) return jsonError('الكود غير موجود', 404)
      await db.codeRedemption.deleteMany({ where: { codeId: rec.id } })
      await db.redeemCode.delete({ where: { id: rec.id } })
      return Response.json({ ok: true })
    }

    if (action === 'add-points') {
      const target = cleanTgId(body.target)
      const delta = Math.round(Number(body.delta) || 0)
      if (!target) return jsonError('معرف اللاعب غير صالح')
      if (!delta) return jsonError('حدد عدد النقاط (يمكن سالبة)')
      const balance = await awardPoints(target, delta, 'admin', `تعديل يدوي من المالك`)
      if (balance === null) return jsonError('اللاعب غير موجود')
      return Response.json({ ok: true, balance })
    }

    return jsonError('إجراء غير معروف')
  } catch {
    return jsonError('خطأ في الخادم', 500)
  }
}
