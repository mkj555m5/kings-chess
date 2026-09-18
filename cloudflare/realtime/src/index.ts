// راوتر خدمة الوقت الحقيقي على Cloudflare Workers
// مسار النشر: /rt/* على نفس النطاق أو نطاق workers.dev مستقل
// SSE للاستقبال + POST للأوامر + CORS مفتوح (لا توجد كوكيز)
import { QueueDO, type Env as QueueEnv } from './queue'
import { RoomDO } from './room'

export interface Env {
  ROOM_DO: DurableObjectNamespace
  QUEUE_DO: DurableObjectNamespace
}

export { RoomDO, QueueDO }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } })
}

async function roomAction(env: Env, code: string, body: Record<string, unknown>): Promise<Response> {
  const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(code))
  return stub.fetch('https://room/action', { method: 'POST', body: JSON.stringify(body) })
}

const handler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })

    const url = new URL(request.url)
    // ندعم الجذر / والبادئة /rt (حسب طريقة الربط)
    const path = url.pathname.replace(/^\/rt/, '') || '/'

    try {
      // ===== المباراة السريعة =====
      if (path === '/wait' && request.method === 'GET') {
        const tc = url.searchParams.get('tc') || 'none'
        const queueId = env.QUEUE_DO.idFromName(`quick-${tc}`)
        const queueStub = env.QUEUE_DO.get(queueId)
        const resp = await queueStub.fetch(`https://queue/wait?clientId=${encodeURIComponent(url.searchParams.get('clientId') || '')}&name=${encodeURIComponent(url.searchParams.get('name') || '')}&tc=${encodeURIComponent(tc)}`, request)
        const out = new Response(resp.body, resp)
        for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v)
        return out
      }

      if (path === '/cancel' && request.method === 'POST') {
        const body = (await request.json()) as { clientId: string; timeControl?: string }
        const tc = body.timeControl || 'none'
        const queueStub = env.QUEUE_DO.get(env.QUEUE_DO.idFromName(`quick-${tc}`))
        await queueStub.fetch('https://queue/cancel', { method: 'POST', body: JSON.stringify({ clientId: body.clientId }) })
        return json({ ok: true })
      }

      // ===== الغرف =====
      if (path === '/create' && request.method === 'POST') {
        const body = (await request.json()) as { name?: string; timeControl?: string; clientId: string }
        const name = (body.name || 'لاعب').trim().slice(0, 20) || 'لاعب'
        const tc = ['blitz3', 'blitz5', 'rapid10', 'none'].includes(body.timeControl || '') ? body.timeControl! : 'none'
        const code = randomCodeFor(env)
        const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(code))
        await stub.fetch('https://room/init-private', {
          method: 'POST',
          body: JSON.stringify({ code, timeControl: tc, host: { clientId: body.clientId, name, connected: true } }),
        })
        return json({ ok: true, code, color: 'white', timeControl: tc, youAre: 'white' })
      }

      if (path === '/join' && request.method === 'POST') {
        const body = (await request.json()) as { name?: string; code?: string; clientId: string }
        const name = (body.name || 'لاعب').trim().slice(0, 20) || 'لاعب'
        const code = (body.code || '').trim().toUpperCase()
        if (!/^[A-Z0-9]{3,8}$/.test(code)) return json({ error: 'كود غير صالح' }, 400)
        const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(code))
        const resp = await stub.fetch('https://room/join', { method: 'POST', body: JSON.stringify({ clientId: body.clientId, name }) })
        const data = (await resp.json()) as Record<string, unknown>
        return json(data, resp.status)
      }

      if (path === '/room' && request.method === 'GET') {
        const code = (url.searchParams.get('code') || '').trim().toUpperCase()
        const clientId = url.searchParams.get('clientId') || ''
        if (!/^[A-Z0-9]{3,8}$/.test(code) || !clientId) return json({ error: 'معاملات ناقصة' }, 400)
        const stub = env.ROOM_DO.get(env.ROOM_DO.idFromName(code))
        const resp = await stub.fetch(`https://room/sse?clientId=${encodeURIComponent(clientId)}`, request)
        const out = new Response(resp.body, resp)
        for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v)
        return out
      }

      if (path === '/action' && request.method === 'POST') {
        const body = (await request.json()) as { type: string; code?: string; clientId: string; [k: string]: unknown }
        if (!body.type || !body.clientId || !body.code) return json({ ok: false, error: 'معاملات ناقصة' }, 400)
        const resp = await roomAction(env, String(body.code).toUpperCase(), body)
        const data = (await resp.json()) as Record<string, unknown>
        return json(data, resp.status)
      }

      if (path === '/health') return json({ ok: true, service: 'kings-chess-rt' })

      return json({ error: 'not found' }, 404)
    } catch (e) {
      console.error('[rt]', e)
      return json({ error: 'خطأ داخلي في خدمة اللعب' }, 500)
    }
  },
}

// توليد كود غرفة غير مستخدم (فحص حتى 5 محاولات)
function randomCodeFor(env: Env): string {
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')
}

// تصدير الأنواع للاستيراد في wrangler (دورة الأنواع فقط)
export type { QueueEnv }

export default handler
