'use client'

// جلسة تلجرام في المتصفح: تُنشأ عند فتح رابط سحري من البوت (?auth=TOKEN)
// تُستخدم لتسجيل الدخول التلقائي وربط اسم اللاعب بحساب تلجرام

export interface TelegramSession {
  telegramId: string
  name: string
  username?: string | null
  isOwner: boolean
  at: number
}

const KEY = 'kings-chess-tg-session-v1'

export function getTelegramSession(): TelegramSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as TelegramSession
    if (!s || !s.telegramId || !s.name) return null
    return s
  } catch {
    return null
  }
}

export function saveTelegramSession(s: Omit<TelegramSession, 'at'>): TelegramSession {
  const full: TelegramSession = { ...s, at: Date.now() }
  try {
    localStorage.setItem(KEY, JSON.stringify(full))
  } catch {
    // تجاهل أخطاء التخزين
  }
  return full
}

export function clearTelegramSession() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // تجاهل
  }
}

/** يبدّل رمزاً سحرياً من البوت بجلسة — يعيد null إذا انتهت صلاحية الرمز */
export async function exchangeLoginToken(token: string): Promise<TelegramSession | null> {
  try {
    const res = await fetch('/api/auth/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { ok: boolean; user?: Omit<TelegramSession, 'at'> }
    if (!data.ok || !data.user) return null
    return saveTelegramSession(data.user)
  } catch {
    return null
  }
}
