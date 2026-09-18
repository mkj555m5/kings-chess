// استبدال أكواد شحن النقاط
import { db } from '@/lib/db'
import { awardPoints, cleanTgId, ensureUser, jsonError } from '@/lib/kingdom-server'

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { tgId?: string; code?: string }
    const tgId = cleanTgId(body.tgId)
    if (!tgId) return jsonError('سجّل دخول عبر تلجرام أولاً')
    const code = String(body.code || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24)
    if (!code) return jsonError('اكتب الكود أولاً')

    const user = await ensureUser(tgId)
    if (!user) return jsonError('المستخدم غير موجود', 404)

    const rec = await db.redeemCode.findUnique({ where: { code }, include: { redemptions: true } })
    if (!rec || !rec.active) return jsonError('الكود غير صحيح أو منتهي')
    if (rec.uses >= rec.maxUses) return jsonError('استُنفد هذا الكود (وصل الحد الأقصى للاستخدام)')
    if (rec.redemptions.some((r) => r.telegramId === tgId)) return jsonError('استخدمت هذا الكود من قبل')

    await db.$transaction([
      db.codeRedemption.create({ data: { codeId: rec.id, telegramId: tgId } }),
      db.redeemCode.update({ where: { id: rec.id }, data: { uses: { increment: 1 } } }),
    ])
    const balance = await awardPoints(tgId, rec.points, 'code', `كود ${code}`)
    return Response.json({ ok: true, points: rec.points, balance })
  } catch {
    return jsonError('خطأ في الخادم', 500)
  }
}
