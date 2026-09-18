// طابور المباراة السريعة - Durable Object واحد لكل ضابط زمني
// اللاعبون يفتحون مجرى SSE للانتظار، وعند توفر اثنين تُنشأ غرفة ويُبلَّغ الطرفان
import { randomCode, RoomDO, type Player } from './room'

interface Waiter {
  clientId: string
  name: string
  write: (event: string, data: unknown) => void
  close: () => void
}

export interface Env {
  ROOM_DO: DurableObjectNamespace
}

export class QueueDO {
  private waiters: Waiter[] = []

  constructor(
    private ctx: DurableObjectState,
    private env: Env,
  ) {}

  private remove(clientId: string): void {
    const idx = this.waiters.findIndex((w) => w.clientId === clientId)
    if (idx >= 0) this.waiters.splice(idx, 1)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // الانضمام للطابور عبر SSE
    if (url.pathname === '/wait' && request.method === 'GET') {
      const clientId = url.searchParams.get('clientId') || ''
      const name = (url.searchParams.get('name') || 'لاعب').trim().slice(0, 20) || 'لاعب'
      const timeControl = url.searchParams.get('tc') || 'none'
      
      if (!clientId) return new Response('bad request', { status: 400 })

      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
      const writer = writable.getWriter()
      const waiter: Waiter = {
        clientId,
        name,
        write: (event, data) => {
          void writer.write(new TextEncoder().encode(`event: msg\ndata: ${JSON.stringify({ t: event, d: data })}\n\n`))
        },
        close: () => {
          writer.close().catch(() => {})
        },
      }

      // هل يوجد منتظر آخر؟
      const opponent = this.waiters.find((w) => w.clientId !== clientId)
      if (opponent) {
        this.remove(opponent.clientId)

        const code = randomCode()
        const whiteFirst = Math.random() < 0.5
        const white: Player = whiteFirst
          ? { clientId: opponent.clientId, name: opponent.name, connected: true }
          : { clientId, name, connected: true }
        const black: Player = whiteFirst ? { clientId, name, connected: true } : { clientId: opponent.clientId, name: opponent.name, connected: true }

        // أنشئ الغرفة
        const roomId = this.env.ROOM_DO.idFromName(code)
        const roomStub = this.env.ROOM_DO.get(roomId)
        await roomStub.fetch('https://room/init', {
          method: 'POST',
          body: JSON.stringify({ code, timeControl, white, black }),
        })

        const colorFor = (cid: string) => (white.clientId === cid ? 'white' : 'black')
        const oppColor = colorFor(opponent.clientId)
        const myColor = colorFor(clientId)
        opponent.write('lobby:matched', { code, color: oppColor, opponent: { name }, timeControl })
        waiter.write('lobby:matched', { code, color: myColor, opponent: { name: opponent.name }, timeControl })
        opponent.close()
        waiter.close()
        return new Response(readable, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' },
        })
      }

      // لا يوجد أحد - ادخل الطابور وأبلغ بالبحث
      this.waiters.push(waiter)
      const enc = new TextEncoder()
      void writer.write(enc.encode(`event: msg\ndata: ${JSON.stringify({ t: 'lobby:searching', d: { timeControl } })}\n\n`))

      // نبض دوري يمنع الوسائط من قطع المجرى أثناء الانتظار
      const ping = setInterval(() => {
        writer.write(enc.encode(': ping\n\n')).catch(() => clearInterval(ping))
      }, 20000)

      request.signal.addEventListener('abort', () => {
        clearInterval(ping)
        this.remove(clientId)
        waiter.close()
      })

      return new Response(readable, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' },
      })
    }

    // إلغاء البحث
    if (url.pathname === '/cancel' && request.method === 'POST') {
      const body = (await request.json()) as { clientId: string }
      const w = this.waiters.find((x) => x.clientId === body.clientId)
      this.remove(body.clientId)
      if (w) w.close()
      return new Response('ok')
    }

    return new Response('not found', { status: 404 })
  }
}

// تصدير لإعادة الاستخدام في المبرمج الرئيسي (أنواع فقط)
export type { RoomDO }
