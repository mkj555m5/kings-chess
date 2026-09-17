import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// تبديل رمز الدخول السحري (من بوت تلجرام) بحساب اللعبة
// يُستخدم من صفحة الموقع: ?auth=TOKEN
export async function POST(req: NextRequest) {
  if (process.env.CF_DEPLOY === '1') {
    return NextResponse.json({ ok: false, error: 'هذه الخدمة متاحة على Railway فقط' }, { status: 503 })
  }
  try {
    const body = await req.json().catch(() => null)
    const token = String((body as { token?: string } | null)?.token || '').trim()
    if (!token || token.length < 10 || token.length > 128) {
      return NextResponse.json({ ok: false, error: 'رمز غير صالح' }, { status: 400 })
    }

    const login = await db.loginToken.findUnique({ where: { token } })
    if (!login || login.used || login.expiresAt < new Date()) {
      return NextResponse.json({ ok: false, error: 'expired' }, { status: 410 })
    }

    // رمز أحادي الاستخدام
    await db.loginToken.update({ where: { id: login.id }, data: { used: true } })

    const user = await db.telegramUser.findUnique({ where: { telegramId: login.telegramId } })
    if (!user) {
      return NextResponse.json({ ok: false, error: 'expired' }, { status: 410 })
    }

    await db.telegramUser.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } })

    return NextResponse.json({
      ok: true,
      user: {
        telegramId: user.telegramId,
        name: user.displayName,
        username: user.username,
        isOwner: user.isOwner,
      },
    })
  } catch (err) {
    console.error('[auth/telegram]', err)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
