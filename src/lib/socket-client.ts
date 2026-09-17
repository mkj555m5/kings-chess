'use client'

// عميل الاتصال بلعبة الأونلاين - نقل مزدوج حسب البيئة:
// - socket.io: بيئة التطوير (بوابة Caddy عبر XTransformPort) و Railway (نفس النطاق)
// - SSE + REST: Cloudflare Workers (خدمة kings-chess-rt عبر Durable Objects)
// الواجهة موحدة تماماً (on/emit/disconnect) فلا يتغير كود اللعبة بين البيئتين

let cachedConfig: RtConfig | null = null

export interface RtConfig {
  transport: 'socketio' | 'sse'
  socketUrl?: string
  socketPath?: string
  rtBase?: string
}

export async function fetchSocketConfig(): Promise<RtConfig> {
  if (cachedConfig) return cachedConfig
  try {
    const res = await fetch('/api/config')
    if (res.ok) {
      cachedConfig = await res.json()
      return cachedConfig!
    }
  } catch {
    // الافتراضي
  }
  cachedConfig = { transport: 'socketio', socketUrl: '', socketPath: '/socket.io' }
  return cachedConfig
}

export interface GameConnection {
  readonly id: string
  connected: boolean
  on(event: string, cb: (data?: unknown) => void): void
  emit(event: string, data?: unknown): void
  disconnect(): void
}

type Handler = (data?: unknown) => void

function getClientId(): string {
  try {
    let id = window.localStorage.getItem('kings-chess-client-id')
    if (!id) {
      id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      window.localStorage.setItem('kings-chess-client-id', id)
    }
    return id
  } catch {
    return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

/* ================= نقل socket.io (التطوير و Railway) ================= */

class SocketIOConnection implements GameConnection {
  readonly id: string
  connected = false
  private socket: import('socket.io-client').Socket

  constructor(socket: import('socket.io-client').Socket) {
    this.socket = socket
    this.id = socket.id || 'sio'
    socket.on('connect', () => {
      this.connected = true
    })
    socket.on('disconnect', () => {
      this.connected = false
    })
  }

  on(event: string, cb: Handler): void {
    this.socket.on(event, cb as never)
  }

  emit(event: string, data?: unknown): void {
    this.socket.emit(event, data ?? {})
  }

  disconnect(): void {
    this.socket.disconnect()
  }
}

/* ================= نقل SSE + REST (Cloudflare) ================= */

class SseConnection implements GameConnection {
  readonly id: string
  connected = false
  private handlers = new Map<string, Set<Handler>>()
  private rtBase: string
  private clientId: string
  private waitEs: EventSource | null = null
  private roomEs: EventSource | null = null
  private lastTc = 'none'
  private closed = false

  constructor(rtBase: string) {
    this.rtBase = (rtBase || '/rt').replace(/\/+$/, '')
    this.clientId = getClientId()
    this.id = this.clientId
    // نعلن الجاهزية بعد تسجيل جميع المستمعين في نفس الدورة
    setTimeout(() => {
      if (!this.closed) {
        this.connected = true
        this.dispatch('connect')
      }
    }, 0)
  }

  private dispatch(event: string, data?: unknown): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const cb of set) {
      try {
        cb(data)
      } catch (e) {
        console.error(`[sse-conn] handler ${event}`, e)
      }
    }
  }

  on(event: string, cb: Handler): void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(cb)
  }

  private listenStream(es: EventSource): void {
    es.addEventListener('msg', (ev) => {
      try {
        const parsed = JSON.parse((ev as MessageEvent).data) as { t: string; d?: { code?: string } }
        // بعد التطابق في المباراة السريعة: افتح مجرى الغرفة تلقائياً
        // (في socket.io نفس الاتصال يكفي، أما SSE فلكل غرفة مجرى خاص)
        if (parsed.t === 'lobby:matched' && es === this.waitEs) {
          this.waitEs = null
          try {
            es.close()
          } catch {
            // تجاهل
          }
          if (parsed.d && typeof parsed.d.code === 'string') {
            this.openRoomStream(parsed.d.code)
          }
        }
        this.dispatch(parsed.t, parsed.d)
      } catch {
        // رسالة تالفة - نتجاهلها
      }
    })
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED && !this.closed) {
        // الخادم أغلق المجرى نهائياً (مثلاً حُذفت الغرفة)
        this.dispatch('connect_error', { message: 'انقطع الاتصال بخدمة اللعب' })
      }
      // الأخطاء المؤقتة: المتصفح يعيد المحاولة تلقائياً
    }
  }

  private openRoomStream(code: string): void {
    this.roomEs?.close()
    const url = `${this.rtBase}/room?code=${encodeURIComponent(code)}&clientId=${encodeURIComponent(this.clientId)}`
    const es = new EventSource(url)
    this.roomEs = es
    this.listenStream(es)
    // نبض دوري يخبر الغرفة أننا ما زلنا متصلين
    const hb = setInterval(() => {
      if (es.readyState === EventSource.CLOSED || this.closed) {
        clearInterval(hb)
        return
      }
      void this.post('/action', { type: 'heartbeat', code }).catch(() => {})
    }, 20000)
  }

  private async post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.rtBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, clientId: this.clientId }),
    })
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) throw Object.assign(new Error(String(data.error || res.status)), { data, status: res.status })
    return data
  }

  emit(event: string, data?: unknown): void {
    if (this.closed) return
    const d = (data ?? {}) as Record<string, unknown>
    switch (event) {
      case 'lobby:quick': {
        this.lastTc = String(d.timeControl || 'none')
        this.waitEs?.close()
        const url =
          `${this.rtBase}/wait?clientId=${encodeURIComponent(this.clientId)}` +
          `&name=${encodeURIComponent(String(d.name || 'لاعب'))}&tc=${encodeURIComponent(this.lastTc)}`
        const es = new EventSource(url)
        this.waitEs = es
        this.listenStream(es)
        break
      }
      case 'lobby:cancel': {
        this.waitEs?.close()
        this.waitEs = null
        void this.post('/cancel', { timeControl: this.lastTc }).catch(() => {})
        break
      }
      case 'room:create': {
        void this.post('/create', { name: d.name, timeControl: d.timeControl })
          .then((res) => {
            const code = String(res.code || '')
            void this.openRoomStream(code)
            this.dispatch('room:created', res)
          })
          .catch((e) => this.dispatch('room:error', { message: e?.data?.error || 'تعذر إنشاء الغرفة' }))
        break
      }
      case 'room:join': {
        void this.post('/join', { name: d.name, code: d.code })
          .then((res) => {
            void this.openRoomStream(String(res.code || d.code || ''))
            this.dispatch('room:joined', res)
          })
          .catch((e) => this.dispatch('room:error', { message: e?.data?.error || 'تعذر الانضمام للغرفة' }))
        break
      }
      case 'game:move':
        void this.post('/action', { type: 'move', code: d.code, from: d.from, to: d.to, promotion: d.promotion }).catch(() => {})
        break
      case 'game:timeout':
        void this.post('/action', { type: 'timeout', code: d.code }).catch(() => {})
        break
      case 'game:resign':
        void this.post('/action', { type: 'resign', code: d.code }).catch(() => {})
        break
      case 'game:draw-offer':
        void this.post('/action', { type: 'draw-offer', code: d.code }).catch(() => {})
        break
      case 'game:draw-accept':
        void this.post('/action', { type: 'draw-accept', code: d.code }).catch(() => {})
        break
      case 'game:draw-decline':
        void this.post('/action', { type: 'draw-decline', code: d.code }).catch(() => {})
        break
      case 'game:rematch-offer':
        void this.post('/action', { type: 'rematch-offer', code: d.code }).catch(() => {})
        break
      case 'game:rematch-accept':
        void this.post('/action', { type: 'rematch-accept', code: d.code }).catch(() => {})
        break
      case 'game:rematch-decline':
        void this.post('/action', { type: 'rematch-decline', code: d.code }).catch(() => {})
        break
      case 'chat:message':
        void this.post('/action', { type: 'chat', code: d.code, text: d.text }).catch(() => {})
        break
      case 'room:leave':
        void this.post('/action', { type: 'leave', code: d.code })
          .catch(() => {})
          .finally(() => {
            this.roomEs?.close()
            this.roomEs = null
          })
        break
      default:
        console.warn('[sse-conn] حدث غير معروف:', event)
    }
  }

  disconnect(): void {
    this.closed = true
    this.connected = false
    this.waitEs?.close()
    this.roomEs?.close()
    this.waitEs = null
    this.roomEs = null
    this.dispatch('disconnect')
  }
}

/* ================= نقطة الدخول ================= */

export async function connectGameConnection(): Promise<GameConnection> {
  const config = await fetchSocketConfig()
  if (config.transport === 'sse') {
    return new SseConnection(config.rtBase || '/rt')
  }
  const { io } = await import('socket.io-client')
  const options = {
    path: config.socketPath || '/socket.io',
    transports: ['websocket', 'polling'] as ('websocket' | 'polling')[],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
    timeout: 10000,
  }
  const socket = config.socketUrl ? io(config.socketUrl, options) : io(options)
  return new SocketIOConnection(socket)
}

// توافق خلفي: كود قديم قد يستدعي هذه
export async function connectGameSocket(): Promise<import('socket.io-client').Socket> {
  const config = await fetchSocketConfig()
  const { io } = await import('socket.io-client')
  const options = {
    path: config.socketPath || '/socket.io',
    transports: ['websocket', 'polling'] as ('websocket' | 'polling')[],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
    timeout: 10000,
  }
  return config.socketUrl ? io(config.socketUrl, options) : io(options)
}
