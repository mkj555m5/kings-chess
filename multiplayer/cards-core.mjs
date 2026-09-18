// نواة ألعاب الكروت الأونلاين — سوبر المزاد واللاعب المجهول بين لاعبين حقيقيين
// الخادم يدير كل شيء: الغرف، المزايدات، المؤقت (10 ثوانٍ)، التعويضات، الأدوار، والمحاكاة
// الأنماط: مزاد كلاسيك (50م/6 جولات) ومزاد برو ماكس (200م/12 جولة) ومجهول (12 بطاقة)
import { simulateMatch, cardsByIds } from './match-sim.mjs'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const BID_MS = 10000 // مهلة المزايدة 10 ثوانٍ
const MATCH_DELAY_MS = 3000 // محاكاة المباراة بعد 3 ثوانٍ من اكتمال التشكيلتين

// بيانات الكروت (مطابقة لـ src/lib/cards-data.ts)
const cardsJson = (await import('./cards-data.json', { with: { type: 'json' } })).default
export const ALL_CARDS = cardsJson
const CARD_BY_ID = new Map(ALL_CARDS.map((c) => [c.id, c]))

function weightFor(rating) {
  if (rating >= 99) return 1
  if (rating >= 98) return 1
  if (rating >= 97) return 2
  if (rating >= 95) return 4
  if (rating >= 93) return 9
  if (rating >= 91) return 15
  if (rating >= 89) return 24
  if (rating >= 87) return 36
  if (rating >= 85) return 50
  if (rating >= 83) return 70
  return 100
}

function pickWeighted(pool) {
  const weights = pool.map((c) => weightFor(c.rating))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

const POSITION_TYPES = ['GK', 'ST', 'RW', 'LW', 'CAM', 'CM', 'CDM', 'CB', 'RB', 'LB']

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildRoundTypes(totalRounds) {
  const rest = shuffle(POSITION_TYPES.filter((p) => p !== 'GK' && p !== 'ST'))
  const types = ['GK', 'ST', ...rest]
  const out = types.slice(0, Math.min(totalRounds, types.length))
  let i = 0
  while (out.length < totalRounds && i < types.length * 3) {
    const candidate = types[i % types.length]
    if (candidate !== out[out.length - 1]) out.push(candidate)
    i++
  }
  return out
}

function pickCardOfType(type, owned, promax = false) {
  let pool = ALL_CARDS.filter((c) => c.pos === type && !owned.has(c.id))
  if (!pool.length) pool = ALL_CARDS.filter((c) => c.pos === type)
  if (!pool.length) {
    const any = ALL_CARDS.filter((c) => !owned.has(c.id))
    return pickWeighted(any.length ? any : ALL_CARDS)
  }
  if (!promax) return pickWeighted(pool)
  const weights = pool.map((c) => (c.rating >= 93 ? 6 : c.rating >= 90 ? 4 : 1))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

const cfg = (mode) => (mode === 'promax' ? { budget: 200, totalRounds: 12 } : { budget: 50, totalRounds: 6 })

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

export function createCardsCore(io) {
  const rooms = new Map() // code -> room

  const socketSeat = (room, socketId) => {
    if (room.players.host && room.players.host.socketId === socketId) return 'host'
    if (room.players.guest && room.players.guest.socketId === socketId) return 'guest'
    return 'spect'
  }

  const ownedIds = (room) => new Set([...room.hostSquad.map((c) => c.id), ...room.guestSquad.map((c) => c.id)])

  function publicState(room) {
    const base = {
      game: room.game,
      code: room.code,
      mode: room.mode,
      phase: room.phase, // waiting | playing | complete | done
      host: room.players.host ? { name: room.players.host.name, telegramId: room.players.host.telegramId } : null,
      guest: room.players.guest ? { name: room.players.guest.name, telegramId: room.players.guest.telegramId } : null,
      hostSquad: room.hostSquad,
      guestSquad: room.guestSquad,
      match: room.match || null,
      serverNow: Date.now(),
    }
    if (room.game === 'auction') {
      return {
        ...base,
        budget: room.budget,
        hostSpent: room.hostSpent,
        guestSpent: room.guestSpent,
        round: room.round,
        totalRounds: room.totalRounds,
        current: room.current,
        roundPos: room.roundPos || null,
        price: room.price,
        leader: room.leader,
        deadlineMs: room.deadlineMs,
        log: room.log.slice(-12),
      }
    }
    // mystery
    return {
      ...base,
      round: room.round,
      totalRounds: 6,
      turn: room.turn,
      visible: room.visibleId,
      mystery: room.phase === 'playing' && room.visibleId ? 'hidden' : room.mysteryId,
      poolCount: room.pool.length,
      lastPick: room.lastPick || null,
      log: room.log.slice(-10),
    }
  }

  function broadcast(room) {
    io.to(room.code).emit('cards:state', publicState(room))
  }

  // ===== مزاد =====
  function auctionNextRound(room) {
    room.round++
    if (room.round > room.totalRounds) {
      room.phase = 'complete'
      room.current = null
      room.completeAt = Date.now()
      return
    }
    const owned = ownedIds(room)
    const type = room.roundTypes[room.round - 1] || 'ST'
    room.current = pickCardOfType(type, owned, room.mode === 'promax')
    room.roundPos = type
    room.price = 5
    room.leader = null
    room.deadlineMs = Date.now() + BID_MS
    room.log.push({ at: Date.now(), text: `🛒 الكرت المعروض: ${room.current.name} (${room.current.rating}) — مركز ${type}` })
  }

  function auctionResolveRound(room) {
    const card = room.current
    if (!card) return
    const owner = room.leader // 'host' | 'guest' | null
    const other = owner === 'host' ? 'guest' : 'host'
    if (owner) {
      const winnerName = room.players[owner]?.name || owner
      const loserName = room.players[other]?.name || other
      if (owner === 'host') {
        room.hostSpent += room.price
        room.hostSquad.push(card)
      } else {
        room.guestSpent += room.price
        room.guestSquad.push(card)
      }
      room.log.push({ at: Date.now(), text: `✅ ${winnerName} فاز بـ ${card.name} بـ ${room.price} مليون` })
      compensate(room, other, card.rating, loserName)
    } else {
      room.log.push({ at: Date.now(), text: `⌛ انتهى الوقت — لا أحد زايد على ${card.name}` })
      compensate(room, 'host', card.rating, room.players.host?.name || 'host')
      compensate(room, 'guest', card.rating, room.players.guest?.name || 'guest')
    }
    auctionNextRound(room)
  }

  function compensate(room, side, capRating, name) {
    const owned = ownedIds(room)
    const pool = ALL_CARDS.filter((c) => c.rating <= capRating && !owned.has(c.id))
    if (!pool.length) return
    const card = pickWeighted(pool)
    if (side === 'host') room.hostSquad.push(card)
    else room.guestSquad.push(card)
    room.log.push({ at: Date.now(), text: `🎁 تعويض ${name}: ${card.name} (${card.rating})` })
  }

  // ===== مجهول =====
  function mysteryNextRound(room) {
    room.round++
    if (room.round > 6 || room.pool.length < 2) {
      room.phase = 'complete'
      room.visibleId = null
      room.mysteryId = null
      room.completeAt = Date.now()
      return
    }
    room.visibleId = room.pool[0].id
    room.mysteryId = room.pool[1].id
    room.turn = room.round % 2 === 1 ? 'host' : 'guest'
  }

  function mysteryResolvePick(room, picker, choice) {
    const visible = room.visibleId ? CARD_BY_ID.get(room.visibleId) : null
    const mystery = room.mysteryId ? CARD_BY_ID.get(room.mysteryId) : null
    if (!visible || !mystery || room.phase !== 'playing') return
    const picked = choice === 'visible' ? visible : mystery
    const other = choice === 'visible' ? mystery : visible
    const pickerName = room.players[picker]?.name || picker
    const oppName = room.players[picker === 'host' ? 'guest' : 'host']?.name || 'الخصم'
    if (picker === 'host') {
      room.hostSquad.push(picked)
      room.guestSquad.push(other)
    } else {
      room.guestSquad.push(picked)
      room.hostSquad.push(other)
    }
    room.lastPick = { by: picker, choice, picked, other }
    room.log.push({
      at: Date.now(),
      text: `${pickerName} اختار ${choice === 'mystery' ? 'المجهول' : 'الظاهر'} → ${picked.name} (${picked.rating}) | ذهب ${other.name} (${other.rating}) لـ${oppName}`,
    })
    room.pool = room.pool.filter((c) => c.id !== picked.id && c.id !== other.id)
    room.visibleId = null
    room.mysteryId = null
    mysteryNextRound(room)
  }

  // ===== المحاكاة =====
  function startMatch(room) {
    if (room.phase !== 'complete') return
    room.match = simulateMatch(room.hostSquad, room.guestSquad)
    room.phase = 'done'
    broadcast(room)
  }

  // ===== إنشاء/انضمام =====
  function makePlayer(socket, name, telegramId) {
    return { socketId: socket.id, name: String(name || 'لاعب').trim().slice(0, 20) || 'لاعب', telegramId: cleanTgId(telegramId), connected: true }
  }

  function findWaiting(game, mode) {
    for (const r of rooms.values()) {
      // فقط غرف انتظار بمضيف ما زال متصلاً — لا نلعب ضد أشباح
      if (r.game === game && r.mode === mode && r.phase === 'waiting' && !r.players.guest && r.players.host?.connected) return r
    }
    return null
  }

  function createRoom(socket, { game, mode, name, telegramId, preferredCode }) {
    const code = generateRoomCode(rooms)
    const c = cfg(mode)
    const room = {
      game,
      code,
      mode,
      code,
      players: { host: makePlayer(socket, name, telegramId), guest: null },
      hostSquad: [],
      guestSquad: [],
      hostSpent: 0,
      guestSpent: 0,
      budget: c.budget,
      round: 0,
      totalRounds: c.totalRounds,
      phase: 'waiting',
      current: null,
      roundPos: null,
      price: 5,
      leader: null,
      deadlineMs: 0,
      roundTypes: buildRoundTypes(c.totalRounds),
      log: [],
      pool: [],
      visibleId: null,
      mysteryId: null,
      turn: 'host',
      match: null,
      lastPick: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    }
    rooms.set(code, room)
    socket.join(code)
    return room
  }

  function beginIfReady(room) {
    if (room.phase === 'waiting' && room.players.guest) {
      room.phase = 'playing'
      room.lastActivity = Date.now()
      if (room.game === 'auction') auctionNextRound(room)
      else {
        fillMysteryPool(room)
        mysteryNextRound(room)
      }
    }
  }

  // تعبئة تجمع المجهول: 12 بطاقة بمراكز مختلفة بلا تكرار
  function fillMysteryPool(room) {
    const types = buildRoundTypes(12)
    const pool = []
    const used = new Set()
    for (const t of types) {
      const c = pickCardOfType(t, used)
      used.add(c.id)
      pool.push(c)
    }
    room.pool = shuffle(pool)
  }

  io.on('connection', (socket) => {
    console.log(`[cards] connect ${socket.id}`)
    socket.on('disconnect', () => {
      console.log(`[cards] disconnect ${socket.id}`)
      for (const room of rooms.values()) {
        let changed = false
        for (const seat of ['host', 'guest']) {
          const p = room.players[seat]
          if (p && p.socketId === socket.id && p.connected) {
            p.connected = false
            changed = true
          }
        }
        if (changed) broadcast(room)
      }
    })
    // ===== إنشاء غرفة (أو مزايدة سريعة quick) =====
    const handleCreate = (game) => (payload = {}, ack = () => {}) => {
      const mode = payload.mode === 'promax' ? 'promax' : 'classic'
      let room = null
      if (payload.quick) room = findWaiting(game, mode)
      if (room) {
        // مباراة سريعة: المنضم يصبح الضيف تلقائياً
        if (!room.players.guest && room.players.host?.socketId !== socket.id) {
          room.players.guest = makePlayer(socket, payload.name, payload.telegramId)
        }
        socket.join(room.code)
      } else {
        room = createRoom(socket, { game, mode, name: payload.name, telegramId: payload.telegramId, preferredCode: payload.preferredCode })
      }
      beginIfReady(room)
      console.log(`[cards] create game=${game} mode=${mode} quick=${!!payload.quick} code=${room.code} seat=${socketSeat(room, socket.id)} hostConn=${room.players.host?.connected}`)
      ack({ ok: true, code: room.code, seat: socketSeat(room, socket.id) })
      broadcast(room)
    }

    socket.on('auction:create', handleCreate('auction'))
    socket.on('mystery:create', handleCreate('mystery'))

    // ===== انضمام بكود =====
    const handleJoin = (game) => (payload = {}, ack = () => {}) => {
      const code = String(payload.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
      const room = rooms.get(code)
      if (!room || room.game !== game) return ack({ ok: false, error: 'الغرفة غير موجودة' })
      if (!room.players.guest && (!room.players.host || room.players.host.socketId !== socket.id)) {
        room.players.guest = makePlayer(socket, payload.name, payload.telegramId)
        socket.join(code)
        beginIfReady(room)
      } else if (room.players.guest && room.players.guest.socketId === socket.id) {
        room.players.guest.connected = true
        socket.join(code)
      } else if (room.players.host && room.players.host.socketId === socket.id) {
        room.players.host.connected = true
        room.players.host.socketId = socket.id
        socket.join(code)
      } else {
        socket.join(code) // مشاهد
      }
      room.lastActivity = Date.now()
      ack({ ok: true, code: room.code, seat: socketSeat(room, socket.id) })
      broadcast(room)
    }

    socket.on('auction:join', handleJoin('auction'))
    socket.on('mystery:join', handleJoin('mystery'))

    // ===== مزايدة =====
    socket.on('auction:bid', (payload = {}, ack = () => {}) => {
      const room = rooms.get(String(payload.code || '').toUpperCase().slice(0, 4))
      if (!room || room.game !== 'auction') return ack({ ok: false, error: 'الغرفة غير موجودة' })
      const seat = socketSeat(room, socket.id)
      if (seat === 'spect' || room.phase !== 'playing' || !room.current) return ack({ ok: false, error: 'لا يمكنك المزايدة الآن' })
      const spent = seat === 'host' ? room.hostSpent : room.guestSpent
      const add = Math.max(1, Math.min(20, Math.round(Number(payload.inc) || 1)))
      const newPrice = room.price + add
      if (spent + newPrice > room.budget) return ack({ ok: false, error: 'تجاوزت ميزانيتك!' })
      room.price = newPrice
      room.leader = seat
      room.deadlineMs = Date.now() + BID_MS
      room.lastActivity = Date.now()
      const name = room.players[seat]?.name || seat
      room.log.push({ at: Date.now(), text: `💵 ${name} زايد: ${newPrice} مليون` })
      ack({ ok: true })
      broadcast(room)
    })

    // ===== اختيار المجهول =====
    socket.on('mystery:pick', (payload = {}, ack = () => {}) => {
      const room = rooms.get(String(payload.code || '').toUpperCase().slice(0, 4))
      if (!room || room.game !== 'mystery') return ack({ ok: false, error: 'الغرفة غير موجودة' })
      const seat = socketSeat(room, socket.id)
      if (seat === 'spect' || room.phase !== 'playing' || room.turn !== seat) return ack({ ok: false, error: 'ليس دورك الآن' })
      const choice = payload.choice === 'mystery' ? 'mystery' : 'visible'
      room.lastActivity = Date.now()
      mysteryResolvePick(room, seat, choice)
      ack({ ok: true })
      broadcast(room)
    })
  })

  // نبض الخادم: انتهاء المؤقت + بدء المحاكاة بعد 3 ثوانٍ + تنظيف الغرف المهجورة
  setInterval(() => {
    const now = Date.now()
    for (const [code, room] of rooms) {
      if (room.phase === 'playing' && room.game === 'auction' && room.current && now >= room.deadlineMs) {
        auctionResolveRound(room)
        broadcast(room)
      } else if (room.phase === 'complete' && room.completeAt && now >= room.completeAt + MATCH_DELAY_MS) {
        startMatch(room)
        continue
      }
      // تنظيف: لا اتصال لأي لاعب لأكثر من دقيقتين بعد بدء اللعب، أو غرفة انتظار عمرها 15 دقيقة
      const anyConnected = ['host', 'guest'].some((s) => room.players[s]?.connected)
      if ((!anyConnected && now - room.lastActivity > 120000) || (room.phase === 'waiting' && now - room.createdAt > 15 * 60000)) {
        io.to(code).emit('cards:closed', { code })
        rooms.delete(code)
      }
    }
  }, 500)
}
