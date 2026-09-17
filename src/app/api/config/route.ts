import { NextResponse } from 'next/server'

// إعدادات اتصال اللاعبين - ثلاث بيئات:
// - Cloudflare Workers (CF_DEPLOY=1 من wrangler.jsonc): خدمة الوقت الحقيقي SSE عبر Durable Objects
// - Railway: خادم موحد (server.mjs) يخدم Next.js و Socket.io معاً
// - بيئة التطوير: بوابة Caddy تمرر عبر XTransformPort إلى خدمة Socket المنفصلة
export async function GET() {
  if (process.env.CF_DEPLOY === '1') {
    return NextResponse.json({
      transport: 'sse',
      rtBase: process.env.REALTIME_URL || '/rt',
    })
  }

  if (process.env.RAILWAY_ENVIRONMENT) {
    return NextResponse.json({ transport: 'socketio', socketUrl: '', socketPath: '/socket.io' })
  }

  const overrideUrl = process.env.SOCKET_URL_OVERRIDE
  const overridePath = process.env.SOCKET_PATH_OVERRIDE
  if (overrideUrl !== undefined || overridePath !== undefined) {
    return NextResponse.json({
      transport: 'socketio',
      socketUrl: overrideUrl ?? '',
      socketPath: overridePath ?? '/socket.io',
    })
  }

  return NextResponse.json({ transport: 'socketio', socketUrl: '/?XTransformPort=3003', socketPath: '/' })
}
