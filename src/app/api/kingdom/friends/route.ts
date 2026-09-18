// الأصدقاء: طلب/قبول/رفض/حذف + بحث
import { db } from '@/lib/db'
import { cleanTgId, ensureUser, jsonError } from '@/lib/kingdom-server'

async function snapshot(tgId: string) {
  const [friends, incoming, outgoing] = await Promise.all([
    db.friendship.findMany({ where: { OR: [{ aTgId: tgId }, { bTgId: tgId }], status: 'accepted' } }),
    db.friendship.findMany({ where: { bTgId: tgId, status: 'pending' } }),
    db.friendship.findMany({ where: { aTgId: tgId, status: 'pending' } }),
  ])
  const ids = new Set<string>()
  for (const f of [...friends, ...incoming, ...outgoing]) {
    ids.add(f.aTgId === tgId ? f.bTgId : f.aTgId)
  }
  const users = await db.telegramUser.findMany({
    where: { telegramId: { in: [...ids] } },
    select: { telegramId: true, displayName: true, username: true, points: true, avatarUrl: true, lastSeenAt: true },
  })
  const map = new Map(users.map((u) => [u.telegramId, u]))
  const friendIds = new Set(friends.map((f) => (f.aTgId === tgId ? f.bTgId : f.aTgId)))
  return {
    ok: true,
    friends: [...friendIds].map((id) => map.get(id)).filter(Boolean),
    incoming: incoming.map((f) => ({ ...map.get(f.aTgId), requestId: f.id })).filter(Boolean),
    outgoing: outgoing.map((f) => ({ ...map.get(f.bTgId), requestId: f.id })).filter(Boolean),
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const tgId = cleanTgId(url.searchParams.get('tgId'))
    if (!tgId) return jsonError('معرف غير صالح')
    return Response.json(await snapshot(tgId))
  } catch {
    return jsonError('خطأ في الخادم', 500)
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action?: string; tgId?: string; target?: string; requestId?: string }
    const tgId = cleanTgId(body.tgId)
    if (!tgId) return jsonError('معرف غير صالح')
    const action = String(body.action || '')

    if (action === 'add') {
      // الهدف: معرف رقمي أو اسم مستخدم أو اسم
      const targetRaw = String(body.target || '').trim().replace(/^@/, '')
      if (!targetRaw) return jsonError('اكتب معرف صديقك أو اسمه')
      const byId = /^\d{4,20}$/.test(targetRaw) ? targetRaw : null
      const target = byId
        ? await db.telegramUser.findUnique({ where: { telegramId: byId } })
        : (await db.telegramUser.findFirst({ where: { OR: [{ username: targetRaw.toLowerCase() }, { displayName: targetRaw }] } })) ||
          (await db.telegramUser.findFirst({ where: { displayName: { contains: targetRaw } } }))
      if (!target) return jsonError('لم أجد هذا اللاعب — اطلب منه فتح الموقع عبر البوت أولاً')
      if (target.telegramId === tgId) return jsonError('لا يمكنك إضافة نفسك 😅')
      const existing = await db.friendship.findFirst({
        where: { OR: [{ aTgId: tgId, bTgId: target.telegramId }, { aTgId: target.telegramId, bTgId: tgId }] },
      })
      if (existing) {
        if (existing.status === 'accepted') return jsonError('أنتما صديقان بالفعل')
        if (existing.aTgId === tgId) return jsonError('طلبك معلق بالفعل')
        // الطرف الآخر أرسل لك طلباً — نقبل تلقائياً
        await db.friendship.update({ where: { id: existing.id }, data: { status: 'accepted' } })
        return Response.json({ ok: true, message: `أصبحتما صديقين! ${target.displayName} كان قد أرسل لك طلباً` })
      }
      await ensureUser(tgId)
      await db.friendship.create({ data: { aTgId: tgId, bTgId: target.telegramId, status: 'pending' } })
      return Response.json({ ok: true, message: `📨 أُرسل طلب الصداقة إلى ${target.displayName}` })
    }

    if (action === 'accept' || action === 'reject') {
      const reqId = String(body.requestId || '')
      const fr = await db.friendship.findUnique({ where: { id: reqId } })
      if (!fr || fr.bTgId !== tgId) return jsonError('الطلب غير موجود')
      if (action === 'accept') {
        await db.friendship.update({ where: { id: fr.id }, data: { status: 'accepted' } })
        return Response.json({ ok: true, message: '✅ أصبحتما صديقين!' })
      }
      await db.friendship.delete({ where: { id: fr.id } })
      return Response.json({ ok: true, message: 'تم رفض الطلب' })
    }

    if (action === 'remove') {
      const target = cleanTgId(body.target)
      if (!target) return jsonError('هدف غير صالح')
      await db.friendship.deleteMany({
        where: { OR: [{ aTgId: tgId, bTgId: target }, { aTgId: target, bTgId: tgId }], status: 'accepted' },
      })
      return Response.json({ ok: true, message: 'تمت إزالة الصديق' })
    }

    return jsonError('إجراء غير معروف')
  } catch {
    return jsonError('خطأ في الخادم', 500)
  }
}
