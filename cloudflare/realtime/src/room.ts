// غرفة لعب شطرنج - Durable Object واحدة لكل غرفة
// تنفذ نفس بروتوكول game-core.mjs (النقلات تُتحقق عبر chess.js قبل القبول)
// الإرسال للعملاء عبر SSE، والأوامر تصل عبر راوتر الـ worker بـ stub.fetch
import { Chess } from 'chess.js'

export const TIME_CONTROL_MS: Record<string, number> = { blitz3: 180000, blitz5: 300000, rapid10: 600000 }

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** كود غرفة عشوائي من 5 أحرف */
export function randomCode(): string {
  return Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')
}

export interface Player {
  clientId: string
  name: string
  connected: boolean
}

interface Over {
  result: 'white' | 'black' | 'draw'
  reason: string
}

interface RoomState {
  code: string
  sanHistory: string[]
  timeControl: string
  clocks: { w: number; b: number }
  lastMoveAt: number
  startedAt: number | null
  over: Over | null
  drawOffers: string[]
  rematchOffers: string[]
  players: { white: Player | null; black: Player | null }
}

interface Listener {
  write: (event: string, data: unknown) => void
  close: () => void
}

function sseChunk(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(`event: msg\ndata: ${JSON.stringify({ t: event, d: data })}\n\n`)
}

export class RoomDO {
  private state: RoomState | null = null
  private chess: Chess | null = null
  private listeners = new Map<string, Listener>()
  private loaded = false

  constructor(private ctx: DurableObjectState) {}

  private async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    const saved = (await this.ctx.storage.get<RoomState>('room')) || null
    if (saved) {
      this.state = saved
      this.chess = new Chess()
      for (const san of saved.sanHistory) {
        try {
          this.chess.move(san)
        } catch {
          break
        }
      }
    }
  }

  private async persist(): Promise<void> {
    if (this.state) await this.ctx.storage.put('room', this.state)
  }

  private broadcast(event: string, data: unknown, exceptClientId?: string): void {
    for (const [cid, l] of this.listeners) {
      if (exceptClientId && cid === exceptClientId) continue
      try {
        l.write(event, data)
      } catch {
        this.listeners.delete(cid)
      }
    }
  }

  private publicState(): Record<string, unknown> {
    const room = this.state!
    const chess = this.chess!
    const history = chess.history({ verbose: true })
    const last = history[history.length - 1] || null
    const turn = chess.turn()
    const clocks = { w: room.clocks.w, b: room.clocks.b }
    if (room.timeControl !== 'none' && !room.over && room.startedAt) {
      const elapsed = Date.now() - room.lastMoveAt
      clocks[turn] = Math.max(0, clocks[turn] - elapsed)
    }
    let checkSquare: string | null = null
    if (chess.isCheck()) {
      for (const row of chess.board()) {
        for (const sq of row) {
          if (sq && sq.type === 'k' && sq.color === turn) checkSquare = sq.square
        }
      }
    }
    return {
      code: room.code,
      fen: chess.fen(),
      turn,
      lastMove: last ? { from: last.from, to: last.to, san: last.san } : null,
      historySan: chess.history(),
      captured: {
        w: history.filter((m) => m.color === 'w' && m.captured).map((m) => m.captured),
        b: history.filter((m) => m.color === 'b' && m.captured).map((m) => m.captured),
      },
      clocks,
      serverNow: Date.now(),
      timeControl: room.timeControl,
      checkSquare,
      status: {
        over: !!room.over,
        result: room.over ? room.over.result : null,
        reason: room.over ? room.over.reason : null,
      },
      players: {
        white: room.players.white ? { name: room.players.white.name, connected: room.players.white.connected } : null,
        black: room.players.black ? { name: room.players.black.name, connected: room.players.black.connected } : null,
      },
      moveNumber: Math.floor(chess.history().length / 2) + 1,
    }
  }

  private async broadcastState(): Promise<void> {
    this.broadcast('game:state', this.publicState())
  }

  private async finish(result: 'white' | 'black' | 'draw', reason: string): Promise<void> {
    const room = this.state!
    if (room.over) return
    room.over = { result, reason }
    room.drawOffers = []
    room.rematchOffers = []
    this.broadcast('game:over', { code: room.code, result, reason })
    await this.persist()
    await this.broadcastState()
    await this.armClockAlarm()
  }

  private async checkRulesOver(): Promise<boolean> {
    const chess = this.chess!
    if (chess.isCheckmate()) {
      await this.finish(chess.turn() === 'w' ? 'black' : 'white', 'checkmate')
      return true
    }
    if (chess.isStalemate()) {
      await this.finish('draw', 'stalemate')
      return true
    }
    if (chess.isInsufficientMaterial()) {
      await this.finish('draw', 'insufficient_material')
      return true
    }
    if (chess.isThreefoldRepetition()) {
      await this.finish('draw', 'repetition')
      return true
    }
    if (chess.isDraw()) {
      await this.finish('draw', 'fifty_move')
      return true
    }
    return false
  }

  /** يضبط منبه انتهاء وقت صاحب الدور + تنظيف دوري */
  private async armClockAlarm(): Promise<void> {
    const room = this.state
    if (!room) return
    let next = Date.now() + 10 * 60 * 1000 // تنظيف افتراضي
    if (!room.over && room.startedAt && room.timeControl !== 'none') {
      const turn = this.chess!.turn()
      const expiry = room.lastMoveAt + room.clocks[turn]
      next = Math.min(next, Math.max(Date.now() + 500, expiry))
    }
    const existing = await this.ctx.storage.getAlarm()
    if (existing === null || existing > next || existing < Date.now()) {
      await this.ctx.storage.setAlarm(next)
    }
  }

  async alarm(): Promise<void> {
    await this.load()
    const room = this.state
    if (!room) return
    const now = Date.now()
    if (!room.over && room.startedAt && room.timeControl !== 'none') {
      const turn = this.chess!.turn()
      if (room.clocks[turn] - (now - room.lastMoveAt) <= 0) {
        await this.finish(turn === 'w' ? 'black' : 'white', 'timeout')
      }
    }
    // تنظيف: غرفة منتهية ومهجورة طويلاً
    if (room.over && now - room.lastMoveAt > 10 * 60 * 1000) {
      for (const [, l] of this.listeners) l.close()
      this.listeners.clear()
      await this.ctx.storage.deleteAll()
      this.state = null
      this.chess = null
      this.loaded = false
      return
    }
    await this.armClockAlarm()
  }

  private seatOf(clientId: string): 'white' | 'black' | null {
    const room = this.state
    if (!room) return null
    if (room.players.white?.clientId === clientId) return 'white'
    if (room.players.black?.clientId === clientId) return 'black'
    return null
  }

  async fetch(request: Request): Promise<Response> {
    await this.load()
    const url = new URL(request.url)
    const path = url.pathname

    // تهيئة غرفة من طابور المباراة السريعة (لاعبان كاملان)
    if (path === '/init' && request.method === 'POST') {
      const body = (await request.json()) as { code: string; timeControl: string; white: Player; black: Player }
      const tc = TIME_CONTROL_MS[body.timeControl] ? body.timeControl : 'none'
      this.state = {
        code: body.code,
        sanHistory: [],
        timeControl: tc,
        clocks: { w: TIME_CONTROL_MS[tc] || 0, b: TIME_CONTROL_MS[tc] || 0 },
        lastMoveAt: Date.now(),
        startedAt: Date.now(),
        over: null,
        drawOffers: [],
        rematchOffers: [],
        players: { white: body.white, black: body.black },
      }
      this.chess = new Chess()
      await this.persist()
      await this.broadcastState()
      await this.armClockAlarm()
      return new Response('ok')
    }

    // تهيئة غرفة خاصة (المضيف أبيض وينتظر خصماً)
    if (path === '/init-private' && request.method === 'POST') {
      const body = (await request.json()) as { code: string; timeControl: string; host: Player }
      const tc = TIME_CONTROL_MS[body.timeControl] ? body.timeControl : 'none'
      this.state = {
        code: body.code,
        sanHistory: [],
        timeControl: tc,
        clocks: { w: TIME_CONTROL_MS[tc] || 0, b: TIME_CONTROL_MS[tc] || 0 },
        lastMoveAt: Date.now(),
        startedAt: null,
        over: null,
        drawOffers: [],
        rematchOffers: [],
        players: { white: body.host, black: null },
      }
      this.chess = new Chess()
      await this.persist()
      await this.armClockAlarm()
      return new Response('ok')
    }

    // فحص وجود الغرفة (قبل الانضمام)
    if (path === '/info' && request.method === 'GET') {
      if (!this.state) return new Response(JSON.stringify({ error: 'الغرفة غير موجودة، تأكد من الكود' }), { status: 404 })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    // انضمام لاعب (أسود عادةً) أو إعادة اتصال
    if (path === '/join' && request.method === 'POST') {
      const body = (await request.json()) as { clientId: string; name: string }
      const room = this.state
      if (!room) return new Response(JSON.stringify({ error: 'الغرفة غير موجودة، تأكد من الكود' }), { status: 404 })

      for (const seat of ['white', 'black'] as const) {
        const p = room.players[seat]
        if (p && (p.clientId === body.clientId || (p.name === body.name && !p.connected))) {
          const reconnected = !p.connected
          p.clientId = body.clientId
          p.connected = true
          await this.persist()
          if (reconnected) this.broadcast('opponent:reconnected', { seat }, body.clientId)
          return new Response(
            JSON.stringify({
              ok: true,
              code: room.code,
              color: seat,
              youAre: seat,
              reconnected,
              opponent: room.players[seat === 'white' ? 'black' : 'white']?.name || null,
            }),
            { status: 200 },
          )
        }
      }

      if (room.players.black && room.players.white) {
        return new Response(JSON.stringify({ error: 'الغرفة ممتلئة' }), { status: 409 })
      }
      room.players.black = { clientId: body.clientId, name: body.name, connected: true }
      if (!room.startedAt) room.startedAt = Date.now()
      room.lastMoveAt = Date.now()
      await this.persist()
      this.broadcast('opponent:joined', { name: body.name }, body.clientId)
      await this.broadcastState()
      await this.armClockAlarm()
      return new Response(
        JSON.stringify({ ok: true, code: room.code, color: 'black', youAre: 'black', opponent: room.players.white?.name || null }),
        { status: 200 },
      )
    }

    // مجرى SSE للاستقبال الحي
    if (path === '/sse' && request.method === 'GET') {
      const clientId = url.searchParams.get('clientId') || ''
      const room = this.state
      if (!room || !clientId) return new Response('no room', { status: 404 })
      const seat = this.seatOf(clientId)

      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
      const writer = writable.getWriter()
      const enc = new TextEncoder()
      const listener: Listener = {
        write: (event, data) => {
          void writer.write(sseChunk(event, data))
        },
        close: () => {
          clearInterval(ping)
          writer.close().catch(() => {})
        },
      }
      // نبض دوري يمنع الوسائط من قطع المجرى الخامل
      const ping = setInterval(() => {
        writer.write(enc.encode(': ping\n\n')).catch(() => clearInterval(ping))
      }, 25000)
      this.listeners.set(clientId, listener)

      // الحالة الكاملة فور الاتصال
      void writer.write(sseChunk('game:state', this.publicState()))

      // إعادة اتصال عبر نفس clientId
      if (seat) {
        const p = room.players[seat]
        if (p && !p.connected) {
          p.connected = true
          void this.persist().then(async () => {
            this.broadcast('opponent:reconnected', { seat }, clientId)
            await this.broadcastState()
          })
        }
      }

      request.signal.addEventListener('abort', () => {
        clearInterval(ping)
        this.listeners.delete(clientId)
        const st = this.state
        if (st && seat) {
          const pl = st.players[seat]
          if (pl && pl.clientId === clientId && pl.connected) {
            pl.connected = false
            void this.persist().then(async () => {
              this.broadcast('opponent:left', { code: st.code, seat }, clientId)
              await this.broadcastState()
            })
          }
        }
      })

      return new Response(readable, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      })
    }

    // تنفيذ أمر لعب
    if (path === '/action' && request.method === 'POST') {
      const body = (await request.json()) as { type: string; clientId: string; [k: string]: unknown }
      const room = this.state
      if (!room) return new Response(JSON.stringify({ ok: false }), { status: 404 })
      const clientId = body.clientId
      const seat = this.seatOf(clientId)
      const chess = this.chess!
      const now = Date.now()

      switch (body.type) {
        case 'move': {
          if (room.over || !seat) break
          const turn = chess.turn()
          if ((turn === 'w' && seat !== 'white') || (turn === 'b' && seat !== 'black')) break
          try {
            chess.move({
              from: String(body.from || ''),
              to: String(body.to || ''),
              promotion: typeof body.promotion === 'string' && body.promotion ? body.promotion : undefined,
            })
          } catch {
            break // نقلة غير قانونية - نتجاهلها
          }
          if (room.timeControl !== 'none') {
            const elapsed = now - room.lastMoveAt
            room.clocks[turn] = Math.max(0, room.clocks[turn] - elapsed)
          }
          room.lastMoveAt = now
          room.sanHistory = chess.history()
          room.drawOffers = []
          await this.persist()
          if (!(await this.checkRulesOver())) {
            await this.broadcastState()
            await this.armClockAlarm()
          }
          break
        }
        case 'timeout': {
          if (room.over || room.timeControl === 'none' || !room.startedAt || !seat) break
          const turn = chess.turn()
          const seatColor = seat === 'white' ? 'w' : 'b'
          if (turn !== seatColor) break
          if (room.clocks[turn] - (now - room.lastMoveAt) <= 0) {
            await this.finish(turn === 'w' ? 'black' : 'white', 'timeout')
          }
          break
        }
        case 'resign': {
          if (room.over || !seat) break
          await this.finish(seat === 'white' ? 'black' : 'white', 'resign')
          break
        }
        case 'draw-offer': {
          if (room.over || !seat) break
          if (!room.drawOffers.includes(seat)) room.drawOffers.push(seat)
          await this.persist()
          this.broadcast('game:draw-offered', { from: seat }, clientId)
          break
        }
        case 'draw-accept': {
          if (room.over || !seat) break
          if (room.drawOffers.length > 0) await this.finish('draw', 'agreement')
          break
        }
        case 'draw-decline': {
          if (room.over || !seat) break
          room.drawOffers = []
          await this.persist()
          this.broadcast('game:draw-declined', {}, clientId)
          break
        }
        case 'rematch-offer': {
          if (!seat) break
          if (!room.rematchOffers.includes(seat)) room.rematchOffers.push(seat)
          await this.persist()
          this.broadcast('rematch:offered', { from: seat }, clientId)
          break
        }
        case 'rematch-decline': {
          if (!seat) break
          room.rematchOffers = []
          await this.persist()
          this.broadcast('rematch:declined', {}, clientId)
          break
        }
        case 'rematch-accept': {
          if (!seat || room.rematchOffers.length === 0) break
          const oldWhite = room.players.white
          const oldBlack = room.players.black
          this.chess = new Chess()
          room.players.white = oldBlack
          room.players.black = oldWhite
          room.sanHistory = []
          room.clocks = { w: TIME_CONTROL_MS[room.timeControl] || 0, b: TIME_CONTROL_MS[room.timeControl] || 0 }
          room.lastMoveAt = now
          room.startedAt = now
          room.over = null
          room.rematchOffers = []
          room.drawOffers = []
          await this.persist()
          this.broadcast('rematch:started', { swapped: true })
          await this.broadcastState()
          await this.armClockAlarm()
          break
        }
        case 'chat': {
          if (!seat) break
          const clean = String(body.text || '').trim().slice(0, 300)
          if (!clean) break
          const name = seat === 'white' ? room.players.white?.name || 'أبيض' : room.players.black?.name || 'أسود'
          this.broadcast('chat:message', { code: room.code, from: seat, name, text: clean, at: Date.now() })
          break
        }
        case 'leave': {
          if (!seat) break
          const p = room.players[seat]
          if (p && p.clientId === clientId) p.connected = false
          await this.persist()
          this.broadcast('opponent:left', { code: room.code, seat }, clientId)
          await this.broadcastState()
          break
        }
        case 'heartbeat': {
          if (seat) {
            const p = room.players[seat]
            if (p && !p.connected) {
              p.connected = true
              await this.persist()
              this.broadcast('opponent:reconnected', { seat }, clientId)
              await this.broadcastState()
            }
          }
          break
        }
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    return new Response('not found', { status: 404 })
  }
}
