// نواة لعبة XO الأونلاين — نفس نمط game-core (خادم موثوق)
// تدعم: إنشاء غرفة / انضمام بكود / نقلات محققة من الخادم / مباراة الثأر / المشاهدة المباشرة
import { EventEmitter } from 'node:events'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const xoBus = new EventEmitter()
xoBus.setMaxListeners(50)

function generateRoomCode(rooms) {
  let code = ''
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')
  } while (rooms.has(code))
  return code
}

function cleanTgId(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 20)
  return digits.length >= 4 ? digits : null
}

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

export function winnerOf(board) {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { side: board[a], line: [a, b, c] }
  }
  if (board.every(Boolean)) return { side: 'draw', line: null }
  return null
}

// أفضل نقلة للـ AI (minimax بسيط — مثالي لـ 3×3)
export function bestMove(board, aiSide) {
  const human = aiSide === 'X' ? 'O' : 'X'
  let best = -Infinity
  let move = -1
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue
    board[i] = aiSide
    const score = minimax(board, 0, false, aiSide, human)
    board[i] = null
    if (score > best) { best = score; move = i }
  }
  return move
}

function minimax(board, depth, isMax, ai, human) {
  const w = winnerOf(board)
  if (w) {
    if (w.side === ai) return 10 - depth
    if (w.side === human) return depth - 10
    return 0
  }
  let best = isMax ? -Infinity : Infinity
  for (let i = 0; i < 9; i++) {
    if (board[i]) continue
    board[i] = isMax ? ai : human
    const score = minimax(board, depth + 1, !isMax, ai, human)
    board[i] = null
    best = isMax ? Math.max(best, score) : Math.min(best, score)
  }
  return best
}

export function createXoCore(io) {
  const rooms = new Map() // code -> room

  function publicState(room) {
    return {
      code: room.code,
      board: room.board,
      turn: room.turn,
      status: room.status, // waiting | playing | over
      result: room.result, // X | O | draw | null
      winLine: room.winLine,
      lastIndex: room.lastIndex,
      players: {
        X: room.players.X ? { name: room.players.X.name, telegramId: room.players.X.telegramId || null, connected: room.players.X.connected } : null,
        O: room.players.O ? { name: room.players.O.name, telegramId: room.players.O.telegramId || null, connected: room.players.O.connected } : null,
      },
      serverNow: Date.now(),
    }
  }

  function broadcast(io, room) {
    io.to(room.code).emit('xo:state', publicState(room))
  }

  io.on('connection', (socket) => {
    socket.on('xo:create', ({ name, telegramId, preferredCode }, ack) => {
      const cleanName = String(name || 'لاعب').trim().slice(0, 20) || 'لاعب'
      const tg = cleanTgId(telegramId)
      const wanted = String(preferredCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
      const code = wanted && !rooms.has(wanted) ? wanted : generateRoomCode(rooms)
      const room = {
        code,
        board: Array(9).fill(null),
        turn: 'X',
        status: 'waiting',
        result: null,
        winLine: null,
        lastIndex: -1,
        lastActivity: Date.now(),
        rematch: new Set(),
        players: { X: { socketId: socket.id, name: cleanName, telegramId: tg, connected: true }, O: null },
      }
      rooms.set(code, room)
      socket.join(code)
      socket.data.xoRoom = code
      socket.emit('xo:created', { code, yourSide: 'X' })
      broadcast(io, room)
      xoBus.emit('xo:created', { code, name: cleanName })
      if (typeof ack === 'function') ack({ ok: true, code, yourSide: 'X' })
    })

    socket.on('xo:join', ({ name, code, telegramId }, ack) => {
      const cleanName = String(name || 'لاعب').trim().slice(0, 20) || 'لاعب'
      const cleanCode = String(code || '').trim().toUpperCase().slice(0, 4)
      const room = rooms.get(cleanCode)
      if (!room) {
        socket.emit('xo:error', { message: 'غرفة XO غير موجودة' })
        if (typeof ack === 'function') ack({ ok: false, message: 'غرفة XO غير موجودة' })
        return
      }
      socket.join(cleanCode)
      socket.data.xoRoom = cleanCode
      if (!room.players.O) {
        room.players.O = { socketId: socket.id, name: cleanName, telegramId: cleanTgId(telegramId), connected: true }
        room.status = 'playing'
        room.startedAt = Date.now()
        xoBus.emit('xo:filled', { code: cleanCode, x: room.players.X.name, o: cleanName })
      }
      socket.emit('xo:joined', { code: cleanCode, yourSide: room.players.O?.socketId === socket.id ? 'O' : 'spect' })
      broadcast(io, room)
      if (typeof ack === 'function') ack({ ok: true, code: cleanCode, yourSide: room.players.O?.socketId === socket.id ? 'O' : 'spect' })
    })

    socket.on('xo:move', ({ code, index }) => {
      const room = rooms.get(code)
      if (!room || room.status !== 'playing') return
      const i = Number(index)
      if (!Number.isInteger(i) || i < 0 || i > 8) return
      const side = room.players.X?.socketId === socket.id ? 'X' : room.players.O?.socketId === socket.id ? 'O' : null
      if (!side) return // المشاهدون لا يلعبون
      if (room.turn !== side || room.board[i]) return
      room.board[i] = side
      room.lastIndex = i
      const w = winnerOf(room.board)
      if (w) {
        room.status = 'over'
        room.result = w.side
        room.winLine = w.line
        xoBus.emit('xo:over', { code: room.code, result: w.side, x: room.players.X?.name, o: room.players.O?.name })
      } else {
        room.turn = side === 'X' ? 'O' : 'X'
      }
      room.lastActivity = Date.now()
      broadcast(io, room)
    })

    socket.on('xo:rematch-offer', ({ code }) => {
      const room = rooms.get(code)
      if (!room || room.status !== 'over') return
      const side = room.players.X?.socketId === socket.id ? 'X' : room.players.O?.socketId === socket.id ? 'O' : null
      if (!side) return
      room.rematch.add(side)
      socket.to(room.code).emit('xo:rematch:offered', { from: side })
      if (room.rematch.size >= 2) {
        room.board = Array(9).fill(null)
        room.turn = 'X'
        room.status = 'playing'
        room.result = null
        room.winLine = null
        room.lastIndex = -1
        room.rematch.clear()
        broadcast(io, room)
      }
    })

    socket.on('xo:rematch-decline', ({ code }) => {
      const room = rooms.get(code)
      if (!room) return
      room.rematch.clear()
      socket.to(room.code).emit('xo:rematch:declined', {})
    })

    // المشاهدة المباشرة + قائمة الغرف
    socket.on('xo:spect:join', ({ code }, ack) => {
      const cleanCode = String(code || '').trim().toUpperCase().slice(0, 4)
      const room = rooms.get(cleanCode)
      if (!room) {
        if (typeof ack === 'function') ack({ ok: false, message: 'الغرفة غير موجودة' })
        return
      }
      socket.join(cleanCode)
      socket.emit('xo:state', publicState(room))
      if (typeof ack === 'function') ack({ ok: true, state: publicState(room) })
    })

    socket.on('xo:spect:leave', ({ code }) => {
      const cleanCode = String(code || '').trim().toUpperCase().slice(0, 4)
      if (cleanCode) socket.leave(cleanCode)
    })

    socket.on('xo:list', (_data, ack) => {
      const t = Date.now()
      const list = [...rooms.values()].map((r) => ({
        code: r.code,
        status: r.status,
        x: r.players.X ? { name: r.players.X.name, telegramId: r.players.X.telegramId || null } : null,
        o: r.players.O ? { name: r.players.O.name, telegramId: r.players.O.telegramId || null } : null,
        idleSec: Math.round((t - r.lastActivity) / 1000),
      }))
      if (typeof ack === 'function') ack({ ok: true, list })
    })

    socket.on('xo:leave', ({ code }) => {
      const room = rooms.get(code)
      if (!room) return
      for (const side of ['X', 'O']) {
        if (room.players[side]?.socketId === socket.id) room.players[side].connected = false
      }
      socket.leave(code)
      socket.to(code).emit('xo:opponent:left', {})
      broadcast(io, room)
    })

    socket.on('disconnect', () => {
      const code = socket.data?.xoRoom
      if (!code) return
      const room = rooms.get(code)
      if (!room) return
      for (const side of ['X', 'O']) {
        if (room.players[side]?.socketId === socket.id) room.players[side].connected = false
      }
      broadcast(io, room)
    })
  })

  // تنظيف الغرف المهجورة
  setInterval(() => {
    const t = Date.now()
    for (const [code, room] of rooms) {
      const bothGone = (!room.players.X || !room.players.X.connected) && (!room.players.O || !room.players.O.connected)
      if (bothGone && t - room.lastActivity > 10 * 60 * 1000) rooms.delete(code)
    }
  }, 60000)

  return { rooms }
}
