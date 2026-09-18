// خادم الإنتاج الموحد - مصمم للنشر على Railway
// يخدم تطبيق Next.js + خادم socket.io للعب الأونلاين + بوت تلجرام على نفس المنفذ
import { createServer } from 'http'
import next from 'next'
import { Server } from 'socket.io'
import { createGameCore } from './multiplayer/game-core.mjs'
import { createXoCore } from './multiplayer/xo-core.mjs'
import { createTelegramBot } from './multiplayer/telegram-bot.mjs'
import { PrismaClient } from '@prisma/client'

const port = parseInt(process.env.PORT || '3000', 10)
const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'

// Prisma للبوت والإحصائيات (يعمل على Railway/Node فقط)
let prisma = null
try {
  prisma = new PrismaClient()
  console.log('> قاعدة البيانات متصلة (Prisma)')
} catch (err) {
  console.warn('> ⚠️ تعذر الاتصال بقاعدة البيانات:', err?.message)
}

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

await app.prepare()

const httpServer = createServer((req, res) => {
  // Webhook بوت تلجرام: يُعالج هنا مباشرة (خارج Next) ليصل إلى io و core
  if (bot && req.url && req.url.startsWith(bot.webhookPath)) {
    return bot.handleWebhook(req, res)
  }
  handle(req, res)
})

const io = new Server(httpServer, {
  path: process.env.SOCKET_IO_PATH || '/socket.io',
  cors: {
    origin: process.env.SOCKET_CORS_ORIGIN || '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
})

const core = createGameCore(io)
const xoCore = createXoCore(io)

// بوت تلجرام (يعمل فقط عند تعيين TELEGRAM_BOT_TOKEN)
const bot = createTelegramBot({ core, prisma })

// عمليات تنظيف دورية لقاعدة البيانات
if (prisma) {
  // تنظيف الرموز والتحديات المنتهية كل ساعة
  setInterval(() => {
    void (async () => {
      try {
        await prisma.loginToken.deleteMany({ where: { OR: [{ used: true }, { expiresAt: { lt: new Date(Date.now() - 3600 * 1000) } }] } })
        await prisma.challenge.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } })
      } catch (err) {
        console.warn('> تنظيف قاعدة البيانات:', err?.message)
      }
    })()
  }, 3600 * 1000)
  // فصل قاعدة البيانات عند الإيقاف
  process.on('SIGTERM', () => void prisma.$disconnect().catch(() => {}))
}

if (bot) {
  // إعادة المحاولة: قد لا يكون الشبكة جاهزة لحظة الإقلاع
  const bootBot = async (attempt = 1) => {
    const ok = await bot.start()
    if (!ok && attempt <= 5) {
      console.log(`> إعادة محاولة تشغيل البوت (${attempt}/5) بعد 5 ثوانٍ…`)
      setTimeout(() => void bootBot(attempt + 1), 5000)
    }
  }
  void bootBot()
}

httpServer.listen(port, hostname, () => {
  console.log(`> شطرنج الملوك جاهز على http://${hostname}:${port}`)
  console.log(`> خادم اللعب الأونلاين يعمل على المسار: ${process.env.SOCKET_IO_PATH || '/socket.io'}`)
  if (bot) console.log(`> بوت تلجرام يعمل — Webhook: ${bot.webhookPath}`)
})

process.on('SIGTERM', () => {
  console.log('إيقاف الخادم...')
  httpServer.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0))
})
