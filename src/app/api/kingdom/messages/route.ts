// المراسلة الخاصة: نص / صور / فيديو / ملصقات (تُخزن مضغوطة في قاعدة البيانات)
import { db } from '@/lib/db'
import { cleanTgId, jsonError } from '@/lib/kingdom-server'

const MAX_BODY = 2_600_000 // ≈ 1.9MB ملف ثنائي بعد الترميز
const KINDS = ['text', 'image', 'video', 'sticker']

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const tgId = cleanTgId(url.searchParams.get('tgId'))
    if (!tgId) return jsonError('معرف غير صالح')
    const peer = cleanTgId(url.searchParams.get('peer'))
    const after = url.searchParams.get('after') // جلب الرسائل الأحدث فقط (polling)

    if (peer) {
      const msgs = await db.directMessage.findMany({
        where: {
          OR: [
            { fromTgId: tgId, toTgId: peer },
            { fromTgId: peer, toTgId: tgId },
          ],
          ...(after ? { createdAt: { gt: new Date(Number(after) || 0) } } : {}),
        },
        orderBy: { createdAt: 'asc' },
        take: 120,
      })
      // تعليم رسائل الطرف الآخر كمقروءة
      await db.directMessage.updateMany({ where: { fromTgId: peer, toTgId: tgId, readAt: null }, data: { readAt: new Date() } })
      return Response.json({ ok: true, messages: msgs })
    }

    // قائمة المحادثات مع عدد غير المقروء
    const msgs = await db.directMessage.findMany({
      where: { OR: [{ fromTgId: tgId }, { toTgId: tgId }] },
      orderBy: { createdAt: 'desc' },
      take: 400,
    })
    const convos = new Map<string, { peerTgId: string; lastAt: number; lastKind: string; unread: number; lastText: string }>()
    for (const m of msgs) {
      const peerId = m.fromTgId === tgId ? m.toTgId : m.fromTgId
      const c = convos.get(peerId) || { peerTgId: peerId, lastAt: 0, lastKind: 'text', unread: 0, lastText: '' }
      if (!c.lastAt) {
        c.lastAt = m.createdAt.getTime()
        c.lastKind = m.kind
        c.lastText = m.kind === 'text' ? m.body.slice(0, 60) : m.kind === 'image' ? '🖼 صورة' : m.kind === 'video' ? '🎬 فيديو' : '🎭 ملصق'
      }
      if (m.toTgId === tgId && !m.readAt) c.unread++
      convos.set(peerId, c)
    }
    const list = [...convos.values()].sort((a, b) => b.lastAt - a.lastAt).slice(0, 30)
    const peerIds = list.map((c) => c.peerTgId)
    const users = await db.telegramUser.findMany({
      where: { telegramId: { in: peerIds } },
      select: { telegramId: true, displayName: true, username: true, avatarUrl: true, points: true },
    })
    const umap = new Map(users.map((u) => [u.telegramId, u]))
    return Response.json({
      ok: true,
      threads: list.map((c) => ({ ...c, peer: umap.get(c.peerTgId) || null })),
    })
  } catch {
    return jsonError('خطأ في الخادم', 500)
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { tgId?: string; toTgId?: string; kind?: string; body?: string }
    const tgId = cleanTgId(body.tgId)
    const to = cleanTgId(body.toTgId)
    if (!tgId || !to || to === tgId) return jsonError('مستلم غير صالح')
    const kind = KINDS.includes(String(body.kind)) ? String(body.kind) : 'text'
    let content = String(body.body || '')
    if (!content) return jsonError('الرسالة فارغة')
    if (content.length > MAX_BODY) return jsonError('الملف كبير جداً — الحد ٢ ميجابايت')
    if (kind === 'text') content = content.slice(0, 2000)

    // لا يمكن إرسال رسالة لغير الأصدقاء؟ — نسمح للجميع (مملكة مفتوحة) لكن نتحقق من وجوده
    const target = await db.telegramUser.findUnique({ where: { telegramId: to } })
    if (!target) return jsonError('المستخدم غير موجود')

    const msg = await db.directMessage.create({ data: { fromTgId: tgId, toTgId: to, kind, body: content } })
    return Response.json({ ok: true, message: msg })
  } catch {
    return jsonError('خطأ في الخادم', 500)
  }
}
