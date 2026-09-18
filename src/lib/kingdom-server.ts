// ============ مساعدات خادم مملكة الألعاب ============
import { db } from '@/lib/db'

export function cleanTgId(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, 20)
  return digits.length >= 4 ? digits : null
}

export function cleanName(raw: unknown): string {
  const n = String(raw ?? '')
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .slice(0, 20)
  return n.length >= 2 ? n : ''
}

/** يجلب المستخدم أو ينشئه تلقائياً (تسجيل دخول الموقع يكفي للتسجيل) */
export async function ensureUser(tgId: string, name?: string) {
  const existing = await db.telegramUser.findUnique({ where: { telegramId: tgId } })
  if (existing) return existing
  const fallback = name?.trim() || `لاعب ${tgId.slice(-4)}`
  return db.telegramUser
    .create({ data: { telegramId: tgId, displayName: fallback.slice(0, 20), lastSeenAt: new Date() } })
    .catch(() => db.telegramUser.findUnique({ where: { telegramId: tgId } }))
}

export async function isOwner(tgId: string): Promise<boolean> {
  const u = await db.telegramUser.findUnique({ where: { telegramId: tgId } }).catch(() => null)
  return !!u?.isOwner
}

/** منح نقاط مع سجل شفاف — يعيد الرصيد الجديد */
export async function awardPoints(tgId: string, delta: number, reason: string, note?: string): Promise<number | null> {
  try {
    const user = await db.telegramUser.findUnique({ where: { telegramId: tgId } })
    if (!user) return null
    const balance = Math.max(0, user.points + delta)
    await db.telegramUser.update({ where: { id: user.id }, data: { points: balance, lastSeenAt: new Date() } })
    await db.pointLog.create({ data: { telegramId: tgId, delta, reason, balance, note: note?.slice(0, 120) } })
    return balance
  } catch {
    return null
  }
}

export function jsonError(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status })
}
