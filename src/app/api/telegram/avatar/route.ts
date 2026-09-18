import { NextRequest, NextResponse } from 'next/server'

// جلب صورة الملف الشخصي لتلجرام وتمريرها للعميل (Proxy)
// - يستخدم Bot API: getUserProfilePhotos ثم getFile ثم تنزيل الملف
// - مسار ملفات تلجرام ينتهي بعد ساعة تقريباً، لذا نخزن البايتات في ذاكرة الخادم مع صلاحية
// - إذا لم توجد صورة/توكن نعيد 404 والعميل يعرض أيقونة القطعة البديلة

export const runtime = 'nodejs'

const TTL_MS = 2 * 60 * 60 * 1000 // ساعتان
const MAX_CACHE = 500

const CACHE = new Map<string, { bytes: Buffer; mime: string; exp: number }>()

function img(bytes: Buffer, mime: string, longCache = false) {
  // Uint8Array جديدة (نسخة) لتوافق BodyInit مع أنواع Node الحديثة
  const body = new Uint8Array(bytes)
  return new NextResponse(body, {
    headers: {
      'Content-Type': mime,
      'Cache-Control': longCache ? 'public, max-age=43200' : 'public, max-age=300',
    },
  })
}

async function tg(token: string, method: string, params: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(8000),
  })
  return res.json().catch(() => null)
}

export async function GET(req: NextRequest) {
  if (process.env.CF_DEPLOY === '1') {
    return NextResponse.json({ ok: false, error: 'cloudflare_only_fallback' }, { status: 503 })
  }

  const uid = (req.nextUrl.searchParams.get('user') || '').replace(/\D/g, '').slice(0, 20)
  if (uid.length < 4) return new NextResponse('bad user id', { status: 400 })

  const hit = CACHE.get(uid)
  if (hit && hit.exp > Date.now()) return img(hit.bytes, hit.mime, true)
  if (hit) CACHE.delete(uid)

  const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim()
  if (!token || !/^\d+:.+/.test(token)) return new NextResponse('bot not configured', { status: 404 })

  try {
    const photos = await tg(token, 'getUserProfilePhotos', { user_id: uid, limit: 1 })
    const sizes = photos?.result?.photos?.[0]
    if (!Array.isArray(sizes) || sizes.length === 0) return new NextResponse('no photo', { status: 404 })

    // اختر أكبر مقاس لا يتجاوز 640px (أفاتار واضح بحجم معقول)
    const suitable = sizes.filter((s: { width?: number }) => (s.width ?? 0) <= 640)
    const pick = suitable.length ? suitable[suitable.length - 1] : sizes[sizes.length - 1]

    const file = await tg(token, 'getFile', { file_id: pick.file_id })
    const filePath = file?.result?.file_path
    if (!filePath) return new NextResponse('no file', { status: 404 })

    const fileRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!fileRes.ok) return new NextResponse('fetch failed', { status: 404 })

    const buf = Buffer.from(await fileRes.arrayBuffer())
    if (!buf.length) return new NextResponse('empty', { status: 404 })

    const mime = String(filePath).toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
    CACHE.set(uid, { bytes: buf, mime, exp: Date.now() + TTL_MS })
    if (CACHE.size > MAX_CACHE) {
      const oldest = CACHE.keys().next().value
      if (oldest) CACHE.delete(oldest)
    }
    return img(buf, mime, true)
  } catch {
    return new NextResponse('error', { status: 404 })
  }
}
