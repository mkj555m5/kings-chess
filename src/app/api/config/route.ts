import { NextResponse } from 'next/server'

// إعدادات اتصال اللاعبين - يعمل في بيئتين:
// - بيئة التطوير (بوابة Caddy): يمرر عبر XTransformPort إلى خدمة Socket المنفصلة
// - Railway: خادم مخصص واحد (server.mjs) يخدم Next.js و Socket.io معاً على نفس المنفذ
export async function GET() {
  const overrideUrl = process.env.SOCKET_URL_OVERRIDE
  const overridePath = process.env.SOCKET_PATH_OVERRIDE

  if (overrideUrl !== undefined || overridePath !== undefined) {
    return NextResponse.json({
      socketUrl: overrideUrl ?? '',
      socketPath: overridePath ?? '/socket.io',
    })
  }

  if (process.env.RAILWAY_ENVIRONMENT) {
    // على Railway: socket.io مرفق بنفس خادم Next.js
    return NextResponse.json({ socketUrl: '', socketPath: '/socket.io' })
  }

  // بيئة التطوير المحلية
  return NextResponse.json({ socketUrl: '/?XTransformPort=3003', socketPath: '/' })
}
