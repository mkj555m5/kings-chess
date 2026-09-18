// لوحة متصدرين المملكة — النقاط الكلية من كل الألعاب
import { db } from '@/lib/db'
import { rankFor } from '@/lib/cards-data'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const limit = Math.min(50, Math.max(5, Number(url.searchParams.get('limit')) || 20))
    const [top, total] = await Promise.all([
      db.telegramUser.findMany({
        orderBy: [{ points: 'desc' }, { lastSeenAt: 'desc' }],
        take: limit,
        select: { telegramId: true, displayName: true, username: true, points: true, avatarUrl: true, isOwner: true },
      }),
      db.telegramUser.count(),
    ])
    return Response.json({
      ok: true,
      total,
      top: top.map((u, i) => ({
        pos: i + 1,
        telegramId: u.telegramId,
        displayName: u.displayName,
        username: u.username,
        points: u.points,
        rank: rankFor(u.points),
        isOwner: u.isOwner,
      })),
    })
  } catch {
    return Response.json({ ok: false, error: 'خطأ في الخادم' }, { status: 500 })
  }
}
