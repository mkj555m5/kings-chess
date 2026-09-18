// ============ محرك مملكة الألعاب (الخادم) ============
// إدارة جلسات المزاد (كلاسيك/برو ماكس) ولعبة اللاعب المجهول في الذاكرة
// الخصم = ذكاء اصطناعي يزايد ويختار بحسب قيمة الكروت وميزانيته
// كل شيء يُدار من الخادم: العرض، المزايدة، المؤقت، التعويضات، والمحاكاة

import { ALL_CARDS, CARD_BY_ID, pickWeightedCard, marketValue, type PlayerCardData } from './cards-data'

export type AuctionMode = 'classic' | 'promax'
export type Side = 'me' | 'rival'

export interface AuctionEvent {
  at: number
  kind: 'reveal' | 'bid-me' | 'bid-rival' | 'sold-me' | 'sold-rival' | 'unsold' | 'compensate-me' | 'compensate-rival' | 'timeout'
  text: string
  amount?: number
  cardId?: string
}

export interface AuctionSession {
  id: string
  mode: AuctionMode
  budget: number
  rivalName: string
  rivalBudget: number
  mySquad: PlayerCardData[]
  rivalSquad: PlayerCardData[]
  spent: number
  rivalSpent: number
  round: number // 1-based
  totalRounds: number
  phase: 'bidding' | 'complete' | 'done'
  current: PlayerCardData | null
  price: number
  leader: Side | null
  deadlineMs: number
  log: AuctionEvent[]
  createdAt: number
  rivalPlanMax: number // سقف مزايدة الـ AI لهذه البطاقة
  rivalBidAt: number // موعد نية الـ AI للمزايدة
  aiPersona: { name: string; emoji: string }
  roundTypes: string[] // مركز كل جولة — بلا تكرار
  roundPosLabel?: string // نوع الجولة الحالية للعرض
}

const RIVALS = [
  { name: 'الوزير الذكي', emoji: '🤖' },
  { name: 'المدير فلورينتي', emoji: '🎩' },
  { name: 'الشيخ منصور', emoji: '💰' },
  { name: 'المدرب بيبا', emoji: '🧢' },
  { name: 'الماسح جونيور', emoji: '🧙' },
]

// أنواع المراكز — كل جولة تعرض لاعباً من نوع مختلف بلا تكرار
// مثال: GK ثم ST ثم أجنحة ثم وسط ثم دفاع (كما في المزادات الحقيقية)
const POSITION_TYPES = ['GK', 'ST', 'RW', 'LW', 'CAM', 'CM', 'CDM', 'CB', 'RB', 'LB'] as const

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** ترتيب أنواع الجولات: GK وST دائماً ثم خلط — بلا تكرار حتى استنفاد الأنواع */
function buildRoundTypes(totalRounds: number): string[] {
  const rest = shuffle((POSITION_TYPES as readonly string[]).filter((p) => p !== 'GK' && p !== 'ST'))
  const types = ['GK', 'ST', ...rest]
  const out = types.slice(0, Math.min(totalRounds, types.length))
  // برو ماكس 12 جولة > 10 أنواع — نضيف أنواعاً إضافية بلا تكرار متجاور
  let i = 0
  while (out.length < totalRounds && i < types.length * 3) {
    const candidate = types[i % types.length]
    if (candidate !== out[out.length - 1]) out.push(candidate)
    i++
  }
  return out
}

/** اختيار كرت من نوع مركز محدد (بغير المملوك) — برو ماكس يرجّح الأقوى */
function pickCardOfType(type: string, owned: Set<string>, promax = false): PlayerCardData {
  let pool = ALL_CARDS.filter((c) => c.pos === type && !owned.has(c.id))
  if (!pool.length) pool = ALL_CARDS.filter((c) => c.pos === type) // نوع مستنفد — اسمح بالتكرار
  if (!pool.length) return pickWeightedCard(Math.random, ALL_CARDS.filter((c) => !owned.has(c.id)).length ? ALL_CARDS.filter((c) => !owned.has(c.id)) : ALL_CARDS)
  if (!promax) return pickWeightedCard(Math.random, pool)
  const weights = pool.map((c) => (c.rating >= 93 ? 6 : c.rating >= 90 ? 4 : 1))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

const cfg = (mode: AuctionMode) =>
  mode === 'promax'
    ? { budget: 200, totalRounds: 12, opening: 5, strong: true }
    : { budget: 50, totalRounds: 6, opening: 5, strong: false }

const sessions = new Map<string, AuctionSession>()

export function createAuction(mode: AuctionMode, player: { tgId: string; name: string }): AuctionSession {
  const c = cfg(mode)
  const id = `A${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const s: AuctionSession = {
    id,
    mode,
    budget: c.budget,
    rivalName: RIVALS[Math.floor(Math.random() * RIVALS.length)].name,
    rivalBudget: c.budget,
    mySquad: [],
    rivalSquad: [],
    spent: 0,
    rivalSpent: 0,
    round: 0,
    totalRounds: c.totalRounds,
    phase: 'bidding',
    current: null,
    price: 0,
    leader: null,
    deadlineMs: 0,
    log: [],
    createdAt: Date.now(),
    rivalPlanMax: 0,
    rivalBidAt: 0,
    aiPersona: RIVALS[Math.floor(Math.random() * RIVALS.length)],
    roundTypes: buildRoundTypes(c.totalRounds),
  }
  sessions.set(id, s)
  nextRound(s)
  return s
}

function nextRound(s: AuctionSession) {
  s.round++
  if (s.round > s.totalRounds) {
    s.phase = 'complete'
    s.current = null
    return
  }
  const owned = new Set([...s.mySquad.map((c) => c.id), ...s.rivalSquad.map((c) => c.id)])
  const type = s.roundTypes[s.round - 1] || 'ST'
  s.current = pickCardOfType(type, owned, s.mode === 'promax')
  s.roundPosLabel = type
  s.price = cfg(s.mode).opening
  s.leader = null
  const value = marketValue(s.current)
  // سقف مزايدة AI: قيمة الكرت ±20%، ومقيّد بالميزانية المتبقية وحصة الجولات المتبقية
  const remainingRounds = s.totalRounds - s.round + 1
  const share = Math.max(6, Math.floor((s.rivalBudget - s.rivalSpent) / remainingRounds))
  s.rivalPlanMax = Math.min(Math.floor(value * (0.85 + Math.random() * 0.45)), share + 8)
  s.rivalBidAt = Date.now() + 1200 + Math.random() * 2600
  s.deadlineMs = Date.now() + 10000
  s.log.push({ at: Date.now(), kind: 'reveal', text: `🛒 الكرت المعروض: ${s.current.name} (${s.current.rating})`, cardId: s.current.id, amount: s.price })
}

const MIN_INC = 1

export function bidMe(s: AuctionSession, inc: number): boolean {
  if (s.phase !== 'bidding' || !s.current) return false
  const add = Math.max(MIN_INC, Math.min(20, Math.round(inc) || 1))
  const newPrice = s.price + add
  if (s.spent + newPrice > s.budget) return false // تجاوز الميزانية
  s.price = newPrice
  s.leader = 'me'
  s.deadlineMs = Date.now() + 10000
  s.log.push({ at: Date.now(), kind: 'bid-me', text: `💵 مزايدتك: ${newPrice} مليون`, amount: newPrice, cardId: s.current.id })
  // نية AI للمزايدة مجدداً
  s.rivalBidAt = Date.now() + 1500 + Math.random() * 3500
  return true
}

// خطوة الخادم: مزايدات AI + انتهاء المؤقت — تُستدعى عند كل استعلام
export function tickAuction(s: AuctionSession, now = Date.now()): void {
  if (s.phase !== 'bidding' || !s.current) return

  const aiCanBid = () => s.rivalSpent + s.price + MIN_INC <= s.rivalBudget && s.price + MIN_INC <= s.rivalPlanMax

  if (s.leader === 'me' && now >= s.rivalBidAt && aiCanBid()) {
    // AI يزايد: زيادة ذكية 1-6 حسب قيمة الكرت
    const value = marketValue(s.current)
    const pressure = value >= 40 ? [3, 4, 6] : value >= 18 ? [2, 3, 4] : [1, 2]
    const inc = pressure[Math.floor(Math.random() * pressure.length)]
    const maxAffordable = s.rivalBudget - s.rivalSpent
    const newPrice = Math.min(s.price + inc, s.rivalPlanMax, maxAffordable)
    if (newPrice > s.price) {
      s.price = newPrice
      s.leader = 'rival'
      s.deadlineMs = Date.now() + 10000
      s.log.push({ at: Date.now(), kind: 'bid-rival', text: `${s.aiPersona.emoji} ${s.aiPersona.name} زايد: ${newPrice} مليون`, amount: newPrice, cardId: s.current.id })
      s.rivalBidAt = now + 1500 + Math.random() * 3000
    }
  } else if (s.leader === null && now >= s.rivalBidAt) {
    // لا أحد زايد — AI يبدأ إذا مهتم
    if (aiCanBid()) {
      s.leader = 'rival'
      s.log.push({ at: now, kind: 'bid-rival', text: `${s.aiPersona.emoji} ${s.aiPersona.name} فتح المزاد: ${s.price} مليون`, amount: s.price, cardId: s.current.id })
      s.deadlineMs = now + 10000
      s.rivalBidAt = now + 999999 // لن يعيد المزايدة على نفسه فوراً
    } else {
      s.rivalBidAt = now + 999999
    }
  }

  if (now >= s.deadlineMs) {
    resolveRound(s)
  }
}

function resolveRound(s: AuctionSession) {
  const card = s.current!
  if (s.leader === 'me') {
    s.spent += s.price
    s.mySquad.push(card)
    s.log.push({ at: Date.now(), kind: 'sold-me', text: `✅ فزت بالكرت ${card.name} بـ ${s.price} مليون!`, amount: s.price, cardId: card.id })
    compensate(s, 'rival', card.rating)
  } else if (s.leader === 'rival') {
    s.rivalSpent += s.price
    s.rivalSquad.push(card)
    s.log.push({ at: Date.now(), kind: 'sold-rival', text: `${s.aiPersona.emoji} ${s.aiPersona.name} اشترى ${card.name} بـ ${s.price} مليون`, amount: s.price, cardId: card.id })
    compensate(s, 'me', card.rating)
  } else {
    // لم يزايد أحد: الكرت يُلغى ويعوَّض الطرفان بكروت أضعف
    s.log.push({ at: Date.now(), kind: 'unsold', text: `⌛ انتهى الوقت — لا أحد زايد على ${card.name}`, cardId: card.id })
    compensate(s, 'me', card.rating)
    compensate(s, 'rival', card.rating)
  }
  nextRound(s)
}

// من لا يحصل على اللاعب يعطى لاعباً عشوائياً أضعف أو بنفس قوة كرت المزاد (بغير المملوك)
function compensate(s: AuctionSession, side: Side, capRating: number) {
  const owned = new Set([...s.mySquad.map((c) => c.id), ...s.rivalSquad.map((c) => c.id)])
  const pool = ALL_CARDS.filter((c) => c.rating <= capRating && !owned.has(c.id))
  if (!pool.length) return
  const card = pickWeightedCard(Math.random, pool)
  if (side === 'me') {
    s.mySquad.push(card)
    s.log.push({ at: Date.now(), kind: 'compensate-me', text: `🎁 تعويض لك: ${card.name} (${card.rating})`, cardId: card.id })
  } else {
    s.rivalSquad.push(card)
    s.log.push({ at: Date.now(), kind: 'compensate-rival', text: `🎁 تعويض ${s.aiPersona.name}: ${card.name} (${card.rating})`, cardId: card.id })
  }
}

// ============ لعبة اللاعب المجهول ============
export interface MysterySession {
  id: string
  pool: PlayerCardData[] // 12 كرت
  visibleId: string | null
  mysteryId: string | null
  turn: Side
  round: number // 1..6
  mySquad: PlayerCardData[]
  rivalSquad: PlayerCardData[]
  phase: 'picking' | 'complete' | 'done'
  rivalPickAt: number
  log: { at: number; text: string }[]
  aiPersona: { name: string; emoji: string }
  createdAt: number
}

const mysterySessions = new Map<string, MysterySession>()

export function createMystery(player: { tgId: string; name: string }): MysterySession {
  const id = `M${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  // 12 بطاقة: كل بطاقة من مركز مختلف — لا تكرار (GK ثم ST ثم أجنحة…)
  const types = buildRoundTypes(12)
  const pool: PlayerCardData[] = []
  const used = new Set<string>()
  for (const t of types) {
    pool.push(pickCardOfType(t, used))
    used.add(pool[pool.length - 1].id)
  }

  // خلط
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }

  const s: MysterySession = {
    id,
    pool,
    visibleId: null,
    mysteryId: null,
    turn: 'me',
    round: 0,
    mySquad: [],
    rivalSquad: [],
    phase: 'picking',
    rivalPickAt: 0,
    log: [],
    aiPersona: RIVALS[Math.floor(Math.random() * RIVALS.length)],
    createdAt: Date.now(),
  }
  mysterySessions.set(id, s)
  nextMysteryRound(s)
  return s
}

function nextMysteryRound(s: MysterySession) {
  s.round++
  if (s.round > 6 || s.pool.length < 2) {
    s.phase = 'complete'
    return
  }
  s.visibleId = s.pool[0].id
  s.mysteryId = s.pool[1].id
  s.turn = s.round % 2 === 1 ? 'me' : 'rival'
  if (s.turn === 'rival') s.rivalPickAt = Date.now() + 1500 + Math.random() * 2200
}

// اختيار AI: قارن الظاهر بالمتوسط المتوقع للسحابة
export function tickMystery(s: MysterySession, now = Date.now()): void {
  if (s.phase !== 'picking' || s.turn !== 'rival' || now < s.rivalPickAt) return
  const visible = s.visibleId ? CARD_BY_ID.get(s.visibleId) : null
  const mystery = s.mysteryId ? CARD_BY_ID.get(s.mysteryId) : null
  if (!visible || !mystery) return
  const ev = s.pool.reduce((a, c) => a + c.rating, 0) / s.pool.length
  const choice: 'visible' | 'mystery' = visible.rating >= ev + 1 ? 'visible' : Math.random() < 0.55 ? 'mystery' : 'visible'
  resolveMysteryPick(s, 'rival', choice)
}

// picker يختار — بطاقة الاختيار تعود له والأخرى للخصم
export function resolveMysteryPick(s: MysterySession, picker: Side, choice: 'visible' | 'mystery') {
  const visible = s.visibleId ? CARD_BY_ID.get(s.visibleId)! : null
  const mystery = s.mysteryId ? CARD_BY_ID.get(s.mysteryId)! : null
  if (!visible || !mystery || s.phase !== 'picking') return
  const picked = choice === 'visible' ? visible : mystery
  const other = choice === 'visible' ? mystery : visible
  const pickerName = picker === 'me' ? 'أنت' : `${s.aiPersona.emoji} ${s.aiPersona.name}`
  const oppName = picker === 'me' ? `${s.aiPersona.emoji} ${s.aiPersona.name}` : 'أنت'
  if (picker === 'me') {
    s.mySquad.push(picked)
    s.rivalSquad.push(other)
  } else {
    s.rivalSquad.push(picked)
    s.mySquad.push(other)
  }
  s.log.push({ at: Date.now(), text: `${pickerName} اختار ${choice === 'mystery' ? 'الكرت المجهول' : 'الكرت الظاهر'} → ${picked.name} (${picked.rating}) | ذهب ${other.name} (${other.rating}) لـ${oppName}` })
  s.pool = s.pool.filter((c) => c.id !== picked.id && c.id !== other.id)
  s.visibleId = null
  s.mysteryId = null
  if (s.round >= 6 || s.pool.length < 2) {
    s.phase = 'complete'
  } else {
    nextMysteryRound(s)
  }
}

export function getAuction(id: string) { return sessions.get(id) || null }
export function getMystery(id: string) { return mysterySessions.get(id) || null }

// تنظيف دوري للجلسات القديمة
setInterval(() => {
  const t = Date.now()
  for (const [id, s] of sessions) if (t - s.createdAt > 45 * 60 * 1000) sessions.delete(id)
  for (const [id, s] of mysterySessions) if (t - s.createdAt > 45 * 60 * 1000) mysterySessions.delete(id)
}, 5 * 60 * 1000)
