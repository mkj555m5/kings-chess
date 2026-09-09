'use client'

// الإحصائيات الشخصية المحلية — محفوظة في متصفح اللاعب (localStorage)
// تشمل: عدّاد الفوز/الخسارة/التعادل، سلسلة الانتصارات، وسجل آخر المباريات

export type LocalResult = 'win' | 'loss' | 'draw'
export type LocalMode = 'ai' | 'online' | 'local'

export interface LocalHistoryEntry {
  id: string
  mode: LocalMode
  result: LocalResult
  opponent: string
  difficulty?: string
  moves: number
  at: number
}

export interface LocalStats {
  gamesPlayed: number
  wins: number
  losses: number
  draws: number
  aiWins: number
  onlineWins: number
  currentStreak: number
  bestStreak: number
  history: LocalHistoryEntry[]
}

const STATS_KEY = 'kings-chess-stats-v1'
const NAME_KEY = 'kings-chess-player-name'
const MAX_HISTORY = 25

export const EMPTY_STATS: LocalStats = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  aiWins: 0,
  onlineWins: 0,
  currentStreak: 0,
  bestStreak: 0,
  history: [],
}

function makeId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  } catch {
    // تجاهل - نستخدم البديل
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function sanitize(raw: unknown): LocalStats {
  const base = { ...EMPTY_STATS, history: [] as LocalHistoryEntry[] }
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Record<string, unknown>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)

  const history = Array.isArray(r.history)
    ? r.history
        .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
        .slice(0, MAX_HISTORY)
        .map((h) => ({
          id: typeof h.id === 'string' && h.id ? h.id : makeId(),
          mode: (['ai', 'online', 'local'] as const).includes(h.mode as LocalMode) ? (h.mode as LocalMode) : 'ai',
          result: (['win', 'loss', 'draw'] as const).includes(h.result as LocalResult) ? (h.result as LocalResult) : 'draw',
          opponent: typeof h.opponent === 'string' ? h.opponent.slice(0, 40) : 'خصم',
          difficulty: typeof h.difficulty === 'string' ? h.difficulty.slice(0, 12) : undefined,
          moves: num(h.moves),
          at: num(h.at) || Date.now(),
        }))
    : []

  return {
    gamesPlayed: num(r.gamesPlayed),
    wins: num(r.wins),
    losses: num(r.losses),
    draws: num(r.draws),
    aiWins: num(r.aiWins),
    onlineWins: num(r.onlineWins),
    currentStreak: num(r.currentStreak),
    bestStreak: num(r.bestStreak),
    history,
  }
}

export function loadLocalStats(): LocalStats {
  if (typeof window === 'undefined') return { ...EMPTY_STATS, history: [] }
  try {
    const raw = window.localStorage.getItem(STATS_KEY)
    if (!raw) return { ...EMPTY_STATS, history: [] }
    return sanitize(JSON.parse(raw))
  } catch {
    return { ...EMPTY_STATS, history: [] }
  }
}

function saveStats(stats: LocalStats): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  } catch {
    // التخزين ممتلئ أو محجوب - نتجاهل بهدوء
  }
}

export interface RecordGameInput {
  mode: LocalMode
  result: LocalResult
  opponent: string
  difficulty?: string
  moves: number
}

/** يسجّل نتيجة مباراة في الإحصائيات المحلية ويعيد النسخة المحدثة */
export function recordGame(input: RecordGameInput): LocalStats {
  const stats = loadLocalStats()
  const entry: LocalHistoryEntry = {
    id: makeId(),
    mode: input.mode,
    result: input.result,
    opponent: (input.opponent || 'خصم').slice(0, 40),
    difficulty: input.difficulty ? String(input.difficulty).slice(0, 12) : undefined,
    moves: Math.max(0, Math.floor(input.moves || 0)),
    at: Date.now(),
  }

  stats.gamesPlayed += 1
  if (input.result === 'win') {
    stats.wins += 1
    stats.currentStreak += 1
    stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak)
    if (input.mode === 'ai') stats.aiWins += 1
    if (input.mode === 'online') stats.onlineWins += 1
  } else if (input.result === 'loss') {
    stats.losses += 1
    stats.currentStreak = 0
  } else {
    stats.draws += 1
  }

  stats.history = [entry, ...stats.history].slice(0, MAX_HISTORY)
  saveStats(stats)
  return stats
}

/** تصفير كامل للإحصائيات الشخصية ويعيد النسخة الفارغة */
export function resetLocalStats(): LocalStats {
  const fresh: LocalStats = { ...EMPTY_STATS, history: [] }
  saveStats(fresh)
  return fresh
}

export function getPlayerName(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(NAME_KEY) || ''
  } catch {
    return ''
  }
}

export function setPlayerName(name: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(NAME_KEY, name.slice(0, 30))
  } catch {
    // تجاهل
  }
}
