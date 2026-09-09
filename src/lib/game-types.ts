// أنواع مشتركة للمشروع كله
export type PieceColor = 'w' | 'b'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type GameMode = 'ai' | 'online' | 'local'
export type GameResult = 'win' | 'loss' | 'draw'
export type TimeControl = 'none' | 'blitz3' | 'blitz5' | 'rapid10'

export interface AIMoveRequest {
  fen: string
  difficulty: Difficulty
  historySan: string[]
  playerColor: PieceColor
  playerName: string
  moveNumber: number
}

export interface AIMoveResponse {
  move: { from: string; to: string; promotion?: string; san: string }
  comment: string | null
  evalCp: number // تقييم المحرك بالسنتيبون (من وجهة نظر الأبيض)
  meta: {
    isCapture: boolean
    isCheck: boolean
    isMate: boolean
    source: 'llm' | 'engine'
  }
}

export interface AICommentRequest {
  fenBefore: string
  fenAfter: string
  san: string
  playerColor: PieceColor
  playerName: string
  isCapture: boolean
  isCheck: boolean
  isMate: boolean
  evalSwingCp: number
  force: boolean // إجبار التعليق (نهايات المباريات)
}

export interface AICommentResponse {
  comment: string | null
}

export interface StatsResponse {
  totals: { games: number; aiWins: number; aiLosses: number; onlineWins: number; draws: number }
  topPlayers: { playerName: string; wins: number }[]
  recent: { playerName: string; mode: string; result: string; createdAt: string }[]
}

export const TIME_CONTROL_MS: Record<Exclude<TimeControl, 'none'>, number> = {
  blitz3: 3 * 60 * 1000,
  blitz5: 5 * 60 * 1000,
  rapid10: 10 * 60 * 1000,
}

export const TIME_CONTROL_LABEL: Record<TimeControl, string> = {
  none: 'بدون وقت',
  blitz3: '٣ دقائق',
  blitz5: '٥ دقائق',
  rapid10: '١٠ دقائق',
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'مبتدئ',
  medium: 'محترف',
  hard: 'أسطورة',
}
