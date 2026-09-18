// بحث المستخدمين (لإضافة الأصدقاء) + صور البروفايل
import { db } from '@/lib/db'
import { jsonError } from '@/lib/kingdom-server'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const q = String(url.searchParams.get('q') || '').trim().replace(/^@/, '').slice(0, 30)
    if (q.length < 2) return Response.json({ ok: true, users: [] })
    const users = await db.telegramUser.findMany({
      where: {
        OR: [
          { username: { contains: q.toLowerCase() } },
          { displayName: { contains: q } },
          { telegramId: /^\d+$/.test(q) ? q : undefined },
        ],
      },
      select: { telegramId: true, displayName: true, username: true, points: true, avatarUrl: true },
      take: 10,
    })
    return Response.json({ ok: true, users })
  } catch {
    return jsonError('خطأ في الخادم', 500)
  }
}
