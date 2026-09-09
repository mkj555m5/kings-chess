// خادم الإنتاج الموحد - مصمم للنشر على Railway
// يخدم تطبيق Next.js وخادم socket.io للعب الأونلاين على نفس المنفذ
import { createServer } from 'http'
import next from 'next'
import { Server } from 'socket.io'
import { createGameCore } from './multiplayer/game-core.mjs'

const port = parseInt(process.env.PORT || '3000', 10)
const dev = process.env.NODE_ENV !== 'production'
const hostname = '0.0.0.0'

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

await app.prepare()

const httpServer = createServer((req, res) => {
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

createGameCore(io)

httpServer.listen(port, hostname, () => {
  console.log(`> شطرنج الملوك جاهز على http://${hostname}:${port}`)
  console.log(`> خادم اللعب الأونلاين يعمل على المسار: ${process.env.SOCKET_IO_PATH || '/socket.io'}`)
})

process.on('SIGTERM', () => {
  console.log('إيقاف الخادم...')
  httpServer.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0))
})
