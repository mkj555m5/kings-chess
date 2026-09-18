// خدمة اللعب الأونلاين لبيئة التطوير (socket.io على منفذ 3003)
// منطق الغرف مشترك عبر multiplayer/game-core.mjs (نفس النواة المستخدمة على Railway)
import { createServer } from 'http'
import { Server } from 'socket.io'
import { createGameCore } from '../../multiplayer/game-core.mjs'
import { createXoCore } from '../../multiplayer/xo-core.mjs'
import { createCardsCore } from '../../multiplayer/cards-core.mjs'

const PORT = 3003

const httpServer = createServer()

const io = new Server(httpServer, {
  // لا تغير المسار - تستخدمه بوابة Caddy للتوجيه في بيئة التطوير
  path: '/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6,
})

createGameCore(io)
createXoCore(io)
createCardsCore(io)

httpServer.listen(PORT, () => {
  console.log(`♟️  Chess game server running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('Shutting down chess game server...')
  httpServer.close(() => process.exit(0))
})

process.on('SIGINT', () => {
  httpServer.close(() => process.exit(0))
})
