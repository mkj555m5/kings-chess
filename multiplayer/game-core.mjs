// نواة خادم اللعب الأونلاين - مشتركة بين بيئة التطوير (mini-service) و Railway (server.mjs)
// خادم موثوق: يتحقق من كل نقلة عبر chess.js قبل قبولها
import { Chess } from 'chess.js'
import { EventEmitter } from 'node:events'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const TIME_CONTROL_MS = { blitz3: 180000, blitz5: 300000, rapid10: 600000 }

// ناقل أحداث مشترك: البوت (تلجرام) يسمع منه ليعرف متى تمتلئ غرف التحدي وتنتهي مبارياتها
export const coreBus = new EventEmitter()
coreBus.setMaxListeners(50)

function generateRoomCode(rooms) {
  let code = ''
  do {
    code = Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')
  } while (rooms.has(code))
  return code
}

// تطبيع كود مفضل (من روابط التحدي): أحرف كبيرة من الأبجدية المسموحة فقط
function normalizePreferredCode(preferredCode) {
  const clean = String(preferredCode || '').toUpperCase().split('').filter((c) => CODE_ALPHABET.includes(c)).join('')
  return clean.length === 5 ? clean : null
}

// تطبيع معرف تلجرام (لصورة الملف الشخصي في اللعبة): أرقام فقط، حد أقصى 20 رقم
function cleanTgId(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 20)
  return digits.length >= 4 ? digits : null
}

function nowMs() {
  return Date.now()
}

function publicState(room, serverNow = nowMs()) {
  const chess = room.chess
  const history = chess.history({ verbose: true })
  const last = history[history.length - 1] || null
  const turn = chess.turn()
  let clocks = { w: room.clocks.w, b: room.clocks.b }
  if (room.timeControl !== 'none' && !room.over && room.startedAt) {
    const elapsed = serverNow - room.lastMoveAt
    clocks[turn] = Math.max(0, clocks[turn] - elapsed)
  }
  const board = chess.board()
  let checkSquare = null
  if (chess.isCheck()) {
    for (const row of board) {
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
    serverNow,
    timeControl: room.timeControl,
    checkSquare,
    status: {
      over: !!room.over,
      result: room.over ? room.over.result : null, // 'white' | 'black' | 'draw'
      reason: room.over ? room.over.reason : null,
    },
    players: {
      white: room.players.white ? { name: room.players.white.name, connected: room.players.white.connected, telegramId: room.players.white.telegramId || null } : null,
      black: room.players.black ? { name: room.players.black.name, connected: room.players.black.connected, telegramId: room.players.black.telegramId || null } : null,
    },
    moveNumber: Math.floor(chess.history().length / 2) + 1,
  }
}

function createRoom(rooms, io, { timeControl, preferredCode }) {
  // كود التحدي من بوت تلجرام: استخدمه إن كان متاحاً، وإلا ولّد كوداً عشوائياً
  const wanted = normalizePreferredCode(preferredCode)
  const code = wanted && !rooms.has(wanted) ? wanted : generateRoomCode(rooms)
  const room = {
    code,
    chess: new Chess(),
    timeControl: TIME_CONTROL_MS[timeControl] ? timeControl : 'none',
    clocks: {
      w: TIME_CONTROL_MS[timeControl] || 0,
      b: TIME_CONTROL_MS[timeControl] || 0,
    },
    lastMoveAt: nowMs(),
    startedAt: null,
    over: null,
    rematchOffers: new Set(),
    drawOffers: new Set(),
    players: { white: null, black: null },
  }
  rooms.set(code, room)
  return room
}

function broadcastState(io, room) {
  io.to(room.code).emit('game:state', publicState(room))
}

function finishGame(io, room, result, reason) {
  if (room.over) return
  room.over = { result, reason }
  room.drawOffers.clear()
  room.rematchOffers.clear()
  io.to(room.code).emit('game:over', { code: room.code, result, reason })
  broadcastState(io, room)
  coreBus.emit('game:over', {
    code: room.code,
    result,
    reason,
    white: room.players.white?.name || null,
    black: room.players.black?.name || null,
  })
}

function checkRulesOver(io, room) {
  const chess = room.chess
  if (chess.isCheckmate()) {
    finishGame(io, room, chess.turn() === 'w' ? 'black' : 'white', 'checkmate')
    return true
  }
  if (chess.isStalemate()) {
    finishGame(io, room, 'draw', 'stalemate')
    return true
  }
  if (chess.isInsufficientMaterial()) {
    finishGame(io, room, 'draw', 'insufficient_material')
    return true
  }
  if (chess.isThreefoldRepetition()) {
    finishGame(io, room, 'draw', 'repetition')
    return true
  }
  if (chess.isDraw()) {
    finishGame(io, room, 'draw', 'fifty_move')
    return true
  }
  return false
}

export function createGameCore(io) {
  const rooms = new Map()
  const queues = new Map() // timeControl -> [{socketId, name}]
  const socketRoom = new Map() // socketId -> code
  const quickQueues = new Map() // socketId -> timeControl

  // فحص الساعة كل ثانية
  const clockInterval = setInterval(() => {
    const t = nowMs()
    for (const room of rooms.values()) {
      if (room.over || !room.startedAt || room.timeControl === 'none') continue
      if (!room.players.white?.connected || !room.players.black?.connected) continue
      const turn = room.chess.turn()
      const elapsed = t - room.lastMoveAt
      if (room.clocks[turn] - elapsed <= 0) {
        finishGame(io, room, turn === 'w' ? 'black' : 'white', 'timeout')
      }
    }
  }, 1000)

  // تنظيف الغرف المهجورة
  const cleanupInterval = setInterval(() => {
    const t = nowMs()
    for (const [code, room] of rooms) {
      const bothGone = (!room.players.white || !room.players.white.connected) && (!room.players.black || !room.players.black.connected)
      const idleTooLong = t - room.lastMoveAt > 10 * 60 * 1000
      if (bothGone && (room.over || idleTooLong)) rooms.delete(code)
    }
  }, 60000)

  function leaveCurrentRoom(socket, notify = true) {
    const code = socketRoom.get(socket.id)
    if (!code) return null
    const room = rooms.get(code)
    socketRoom.delete(socket.id)
    if (!room) return null
    const seat = room.players.white?.socketId === socket.id ? 'white' : room.players.black?.socketId === socket.id ? 'black' : null
    if (seat) {
      room.players[seat].connected = false
      if (notify) {
        socket.to(room.code).emit('opponent:left', { code, seat })
      }
    }
    return room
  }

  io.on('connection', (socket) => {
    console.log(`[game-core] connected: ${socket.id}`)

    socket.on('lobby:quick', ({ name, timeControl, telegramId }) => {
      const cleanName = String(name || 'لاعب').trim().slice(0, 20) || 'لاعب'
      const myTg = cleanTgId(telegramId)
      const tc = TIME_CONTROL_MS[timeControl] ? timeControl : 'none'
      leaveCurrentRoom(socket)
      const q = queues.get(tc) || []
      const opponent = q.shift()
      queues.set(tc, q)

      if (opponent && opponent.socketId !== socket.id) {
        const oppSocket = io.sockets.sockets.get(opponent.socketId)
        if (!oppSocket) {
          // الخصم اختفى - أعدنا وضعه في الطابور
          return
        }
        const room = createRoom(rooms, io, { timeControl: tc })
        const whiteFirst = Math.random() < 0.5
        room.players.white = { socketId: whiteFirst ? opponent.socketId : socket.id, name: whiteFirst ? opponent.name : cleanName, telegramId: whiteFirst ? opponent.tg : myTg, connected: true }
        room.players.black = { socketId: whiteFirst ? socket.id : opponent.socketId, name: whiteFirst ? cleanName : opponent.name, telegramId: whiteFirst ? myTg : opponent.tg, connected: true }
        room.startedAt = nowMs()
        socketRoom.set(opponent.socketId, room.code)
        socketRoom.set(socket.id, room.code)
        oppSocket.join(room.code)
        socket.join(room.code)
        coreBus.emit('room:filled', {
          code: room.code,
          timeControl: room.timeControl,
          white: room.players.white?.name || null,
          black: room.players.black?.name || null,
          source: 'quick',
        })

        const myColor = (s) => (room.players.white.socketId === s ? 'white' : 'black')
        oppSocket.emit('lobby:matched', {
          code: room.code,
          color: myColor(opponent.socketId),
          opponent: { name: cleanName, telegramId: myTg },
          timeControl: tc,
        })
        socket.emit('lobby:matched', {
          code: room.code,
          color: myColor(socket.id),
          opponent: { name: opponent.name, telegramId: opponent.tg || null },
          timeControl: tc,
        })
        broadcastState(io, room)
      } else {
        q.push({ socketId: socket.id, name: cleanName, tg: myTg })
        queues.set(tc, q)
        socket.emit('lobby:searching', { timeControl: tc })
      }
    })

    socket.on('lobby:cancel', () => {
      for (const [tc, q] of queues) {
        const idx = q.findIndex((e) => e.socketId === socket.id)
        if (idx >= 0) {
          q.splice(idx, 1)
          queues.set(tc, q)
        }
      }
    })

    socket.on('room:create', ({ name, timeControl, preferredCode, telegramId }) => {
      const cleanName = String(name || 'لاعب').trim().slice(0, 20) || 'لاعب'
      const myTg = cleanTgId(telegramId)
      leaveCurrentRoom(socket)
      const wanted = normalizePreferredCode(preferredCode)
      // سيناريو التحدي (روابط البوت): إن سبق أن فتح المضيف الغرفة بكود التحدي،
      // فإن أول من يفتح الرابط بعده ينضم كأسود مباشرة بدلاً من إنشاء غرفة جديدة
      if (wanted) {
        const existing = rooms.get(wanted)
        if (existing && !existing.over && existing.players.white && !existing.players.black) {
          joinRoomSeat(socket, existing, 'black', cleanName, myTg)
          return
        }
      }
      const room = createRoom(rooms, io, { timeControl, preferredCode: wanted })
      room.players.white = { socketId: socket.id, name: cleanName, telegramId: myTg, connected: true }
      socketRoom.set(socket.id, room.code)
      socket.join(room.code)
      socket.emit('room:created', { code: room.code, color: 'white', timeControl: room.timeControl, youAre: 'white' })
    })

    // الانضمام لمقعد محدد (يستخدمه room:join وسيناريو التحدي في room:create)
    function joinRoomSeat(socket, room, seat, cleanName, cleanTg) {
      // إعادة اتصال: نفس الاسم ونفس المقعد
      for (const s of ['white', 'black']) {
        const p = room.players[s]
        if (p && p.name === cleanName && !p.connected) {
          p.socketId = socket.id
          p.connected = true
          if (cleanTg) p.telegramId = cleanTg
          socketRoom.set(socket.id, room.code)
          socket.join(room.code)
          socket.emit('room:joined', { code: room.code, color: s, youAre: s, reconnected: true, opponent: room.players[s === 'white' ? 'black' : 'white']?.name || null })
          socket.to(room.code).emit('opponent:reconnected', { seat: s })
          broadcastState(io, room)
          return
        }
      }
      if (room.players[seat]) {
        socket.emit('room:error', { message: 'الغرفة ممتلئة' })
        return
      }
      leaveCurrentRoom(socket)
      room.players[seat] = { socketId: socket.id, name: cleanName, telegramId: cleanTg || null, connected: true }
      if (!room.startedAt) room.startedAt = nowMs()
      room.lastMoveAt = nowMs()
      socketRoom.set(socket.id, room.code)
      socket.join(room.code)
      socket.emit('room:joined', { code: room.code, color: seat, youAre: seat, opponent: room.players[seat === 'white' ? 'black' : 'white']?.name || null })
      socket.to(room.code).emit('opponent:joined', { name: cleanName })
      broadcastState(io, room)
      coreBus.emit('room:filled', {
        code: room.code,
        timeControl: room.timeControl,
        white: room.players.white?.name || null,
        black: room.players.black?.name || null,
        source: 'challenge',
      })
    }

    socket.on('room:join', ({ name, code, telegramId }) => {
      const cleanName = String(name || 'لاعب').trim().slice(0, 20) || 'لاعب'
      const cleanCode = String(code || '').trim().toUpperCase()
      const room = rooms.get(cleanCode)
      if (!room) {
        socket.emit('room:error', { message: 'الغرفة غير موجودة، تأكد من الكود' })
        return
      }
      joinRoomSeat(socket, room, 'black', cleanName, cleanTgId(telegramId))
    })

    socket.on('game:move', ({ code, from, to, promotion }) => {
      const room = rooms.get(code)
      if (!room || room.over) return
      const seat = room.players.white?.socketId === socket.id ? 'white' : room.players.black?.socketId === socket.id ? 'black' : null
      if (!seat) return
      const turn = room.chess.turn()
      if ((turn === 'w' && seat !== 'white') || (turn === 'b' && seat !== 'black')) return

      try {
        room.chess.move({ from, to, promotion: promotion && promotion !== '' ? promotion : undefined })
      } catch {
        return // نقلة غير قانونية - نتجاهلها
      }

      // خصم الوقت المستهلك
      if (room.timeControl !== 'none') {
        const elapsed = nowMs() - room.lastMoveAt
        room.clocks[turn] = Math.max(0, room.clocks[turn] - elapsed)
      }
      room.lastMoveAt = nowMs()
      room.drawOffers.clear()

      if (!checkRulesOver(io, room)) {
        broadcastState(io, room)
      }
    })

    socket.on('game:timeout', ({ code }) => {
      const room = rooms.get(code)
      if (!room || room.over || room.timeControl === 'none' || !room.startedAt) return
      const seat = room.players.white?.socketId === socket.id ? 'white' : room.players.black?.socketId === socket.id ? 'black' : null
      if (!seat) return
      const turn = room.chess.turn()
      const seatColor = seat === 'white' ? 'w' : 'b'
      if (turn !== seatColor) return
      const elapsed = nowMs() - room.lastMoveAt
      if (room.clocks[turn] - elapsed <= 0) {
        finishGame(io, room, turn === 'w' ? 'black' : 'white', 'timeout')
      }
    })

    socket.on('game:resign', ({ code }) => {
      const room = rooms.get(code)
      if (!room || room.over) return
      const seat = room.players.white?.socketId === socket.id ? 'white' : room.players.black?.socketId === socket.id ? 'black' : null
      if (!seat) return
      finishGame(io, room, seat === 'white' ? 'black' : 'white', 'resign')
    })

    socket.on('game:draw-offer', ({ code }) => {
      const room = rooms.get(code)
      if (!room || room.over) return
      const seat = room.players.white?.socketId === socket.id ? 'white' : room.players.black?.socketId === socket.id ? 'black' : null
      if (!seat) return
      room.drawOffers.add(seat)
      socket.to(room.code).emit('game:draw-offered', { from: seat })
    })

    socket.on('game:draw-accept', ({ code }) => {
      const room = rooms.get(code)
      if (!room || room.over) return
      const seat = room.players.white?.socketId === socket.id ? 'white' : room.players.black?.socketId === socket.id ? 'black' : null
      if (!seat) return
      if (room.drawOffers.size > 0) {
        finishGame(io, room, 'draw', 'agreement')
      }
    })

    socket.on('game:draw-decline', ({ code }) => {
      const room = rooms.get(code)
      if (!room || room.over) return
      room.drawOffers.clear()
      socket.to(room.code).emit('game:draw-declined', {})
    })

    socket.on('game:rematch-offer', ({ code }) => {
      const room = rooms.get(code)
      if (!room) return
      const seat = room.players.white?.socketId === socket.id ? 'white' : room.players.black?.socketId === socket.id ? 'black' : null
      if (!seat) return
      room.rematchOffers.add(seat)
      socket.to(room.code).emit('rematch:offered', { from: seat })
    })

    socket.on('game:rematch-decline', ({ code }) => {
      const room = rooms.get(code)
      if (!room) return
      const seat = room.players.white?.socketId === socket.id ? 'white' : room.players.black?.socketId === socket.id ? 'black' : null
      if (!seat) return
      room.rematchOffers.clear()
      socket.to(room.code).emit('rematch:declined', {})
    })

    socket.on('game:rematch-accept', ({ code }) => {
      const room = rooms.get(code)
      if (!room) return
      const seat = room.players.white?.socketId === socket.id ? 'white' : room.players.black?.socketId === socket.id ? 'black' : null
      if (!seat) return
      if (!room.rematchOffers || room.rematchOffers.size === 0) return
      // مباراة جديدة مع تبديل الألوان
      const oldWhite = room.players.white
      const oldBlack = room.players.black
      room.chess = new Chess()
      room.players.white = oldBlack
      room.players.black = oldWhite
      room.clocks = { w: TIME_CONTROL_MS[room.timeControl] || 0, b: TIME_CONTROL_MS[room.timeControl] || 0 }
      room.lastMoveAt = nowMs()
      room.startedAt = nowMs()
      room.over = null
      room.rematchOffers.clear()
      room.drawOffers.clear()
      io.to(room.code).emit('rematch:started', { swapped: true })
      broadcastState(io, room)
    })

    socket.on('chat:message', ({ code, text }) => {
      const room = rooms.get(code)
      if (!room) return
      const seat = room.players.white?.socketId === socket.id ? 'white' : room.players.black?.socketId === socket.id ? 'black' : null
      if (!seat) return
      const clean = String(text || '').trim().slice(0, 300)
      if (!clean) return
      const name = seat === 'white' ? room.players.white.name : room.players.black.name
      io.to(room.code).emit('chat:message', { code, from: seat, name, text: clean, at: nowMs() })
    })

    socket.on('room:leave', () => {
      const room = leaveCurrentRoom(socket)
      if (room) broadcastState(io, room)
    })

    // ===== المشاهدة المباشرة (Spectate) =====
    // المشاهد ينضم لغرفة الشطرنج كمتفرج — يستقبل كل التحديثات بدون حق نقلات
    socket.on('spect:join', ({ code }, ack) => {
      const cleanCode = String(code || '').trim().toUpperCase()
      const room = rooms.get(cleanCode)
      if (!room) {
        socket.emit('spect:error', { message: 'الغرفة غير موجودة' })
        if (typeof ack === 'function') ack({ ok: false, message: 'الغرفة غير موجودة' })
        return
      }
      socket.join(cleanCode)
      socket.emit('spect:state', publicState(room))
      if (typeof ack === 'function') ack({ ok: true, state: publicState(room) })
    })

    socket.on('spect:leave', ({ code }) => {
      const cleanCode = String(code || '').trim().toUpperCase()
      if (cleanCode) socket.leave(cleanCode)
    })

    // قائمة الغرف النشطة للمشاهدة (شطرنج)
    socket.on('spect:list', (_data, ack) => {
      const t = nowMs()
      const list = [...rooms.values()].map((r) => ({
        code: r.code,
        over: !!r.over,
        playing: !!(r.players.white && r.players.black),
        white: r.players.white ? { name: r.players.white.name, telegramId: r.players.white.telegramId || null } : null,
        black: r.players.black ? { name: r.players.black.name, telegramId: r.players.black.telegramId || null } : null,
        timeControl: r.timeControl,
        moveNumber: Math.floor(r.chess.history().length / 2) + 1,
        idleSec: Math.round((t - r.lastMoveAt) / 1000),
      }))
      if (typeof ack === 'function') ack({ ok: true, list })
    })

    socket.on('disconnect', () => {
      console.log(`[game-core] disconnected: ${socket.id}`)
      // إزالة من طوابير الانتظار
      for (const [tc, q] of queues) {
        const idx = q.findIndex((e) => e.socketId === socket.id)
        if (idx >= 0) q.splice(idx, 1)
      }
      const room = leaveCurrentRoom(socket, true)
      if (room) broadcastState(io, room)
    })

    socket.on('error', (err) => {
      console.error('[game-core] socket error:', err)
    })
  })

  return { rooms, queues }
}
