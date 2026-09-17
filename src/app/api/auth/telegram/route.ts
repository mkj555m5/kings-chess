import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyTelegramInitData } from '@/lib/telegram-verify'

function cleanDisplayName(raw: string, fallback: string): string {
  const n = String(raw || '')
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .slice(0, 20)
  return n.length >= 2 ? n : fallback
}

function ownerIds(): string[] {
  return (process.env.TELEGRAM_OWNER_ID || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

// تبديل رمز الدخول السحري (من بوت تلجرام) بحساب اللعبة — ?auth=TOKEN
// أو تسجيل دخول دائم من داخل التطبيق المصغر عبر initData الموّقعة (Mini App)
export async function POST(req: NextRequest) {
  if (process.env.CF_DEPLOY === '1') {
    return NextResponse.json({ ok: false, error: 'هذه الخدمة متاحة على Railway فقط' }, { status: 503 })
  }
  try {
    const body = await req.json().catch(() => null)
    const initData = String((body as { initData?: string } | null)?.initData || '').trim()

    // ===== مسار التطبيق المصغر: initData موقّعة رقمياً من تلجرام =====
    if (initData) {
      const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim()
      if (!botToken) {
        return NextResponse.json({ ok: false, error: 'bot_not_configured' }, { status: 503 })
      }
      const miniUser = await verifyTelegramInitData(initData, botToken)
      if (!miniUser) {
        return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 })
      }

      // إنشاء الحساب تلقائياً إن كان أول دخول (حتى بدون /start سابق)
      const data = {
        username: miniUser.username || null,
        firstName: miniUser.firstName || null,
        lastSeenAt: new Date(),
      }
      const user = await db.telegramUser.upsert({
        where: { telegramId: miniUser.telegramId },
        update: data,
        create: {
          telegramId: miniUser.telegramId,
          ...data,
          displayName: cleanDisplayName(miniUser.firstName || miniUser.username || '', `لاعب ${miniUser.telegramId.slice(-4)}`),
          isOwner: ownerIds().includes(miniUser.telegramId),
        },
      })
      if (ownerIds().includes(miniUser.telegramId) && !user.isOwner) {
        await db.telegramUser.update({ where: { id: user.id }, data: { isOwner: true } })
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
    }

    // ===== المسار الأصلي: رمز سحري أحادي الاستخدام من رابط البوت =====
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
