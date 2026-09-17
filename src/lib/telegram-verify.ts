// التحقق من هوية مستخدم تلجرام داخل التطبيق المصغر (Mini App)
//
// عند فتح اللعبة داخل تلجرام (زر web_app / زر القائمة ☰)، يضيف تلجرام
// معلّمة initData موقّعة رقمياً بمفتاح البوت نفسه (HMAC-SHA256).
// نتحقق من التوقيع هنا على الخادم — فنمنح الدخول التلقائي الدائم
// بدون رموز سحرية منتهية الصلاحية.
//
// الخوارزمية الرسمية حسب توثيق تلجرام:
//   secret_key  = HMAC_SHA256(key="WebAppData", message=bot_token)
//   computed    = HMAC_SHA256(key=secret_key, message=data_check_string)
//   data_check_string = أسطر "key=value" مرتبة أبجدياً (بدون hash و signature)

export interface TelegramMiniUser {
  telegramId: string
  firstName: string
  lastName?: string
  username?: string
  photoUrl?: string
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

function toArrayBuffer(u: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u.byteLength)
  new Uint8Array(ab).set(u)
  return ab
}

async function hmac(key: ArrayBuffer, message: string, enc: TextEncoder): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(message))
}

/**
 * يتحقق من صحة initData الموّقعة من تلجرام ويعيد بيانات المستخدم،
 * أو null إذا كان التوقيع/التاريخ غير صالح.
 * @param maxAgeSec أقصى عمر للتوقيع (افتراضياً 24 ساعة)
 */
export async function verifyTelegramInitData(initData: string, botToken: string, maxAgeSec = 86400): Promise<TelegramMiniUser | null> {
  if (!initData || !botToken) return null
  try {
    const params = new URLSearchParams(initData)
    const hash = params.get('hash')
    if (!hash) return null
    // حقلان مستثنيان من سلسلة التحقق حسب التوثيق
    params.delete('hash')
    params.delete('signature')

    const dataCheckString = [...params.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n')

    const enc = new TextEncoder()
    const secret = await hmac(toArrayBuffer(enc.encode('WebAppData')), botToken, enc)
    const computed = hex(await hmac(secret, dataCheckString, enc))
    if (computed !== hash.toLowerCase()) return null

    // منع توقيعات القديمة جداً (هجمات إعادة التشغيل)
    const authDate = Number(params.get('auth_date') || 0)
    const now = Math.floor(Date.now() / 1000)
    if (!authDate || now - authDate > maxAgeSec) return null

    const raw = params.get('user')
    if (!raw) return null
    const u = JSON.parse(raw) as { id?: number | string; first_name?: string; last_name?: string; username?: string; photo_url?: string }
    if (!u?.id) return null
    return {
      telegramId: String(u.id),
      firstName: String(u.first_name || ''),
      lastName: u.last_name,
      username: u.username,
      photoUrl: u.photo_url,
    }
  } catch {
    return null
  }
}
