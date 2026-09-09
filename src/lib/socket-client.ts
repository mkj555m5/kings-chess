'use client'

// عميل Socket.io - يقرأ إعدادات الاتصال من /api/config
// في بيئة التطوير: /?XTransformPort=3003 عبر بوابة Caddy
// على Railway: نفس النطاق مع المسار الافتراضي /socket.io
import { io, type Socket } from 'socket.io-client'

let cachedConfig: { socketUrl: string; socketPath: string } | null = null

export async function fetchSocketConfig(): Promise<{ socketUrl: string; socketPath: string }> {
  if (cachedConfig) return cachedConfig
  try {
    const res = await fetch('/api/config')
    if (res.ok) {
      cachedConfig = await res.json()
      return cachedConfig!
    }
  } catch {
    // نستخدم الافتراضي
  }
  cachedConfig = { socketUrl: '', socketPath: '/socket.io' }
  return cachedConfig
}

export async function connectGameSocket(): Promise<Socket> {
  const { socketUrl, socketPath } = await fetchSocketConfig()
  const options = {
    path: socketPath || '/socket.io',
    transports: ['websocket', 'polling'] as ('websocket' | 'polling')[],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 1000,
    timeout: 10000,
  }
  return socketUrl ? io(socketUrl, options) : io(options)
}
