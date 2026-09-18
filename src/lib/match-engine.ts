// ============ محرك محاكاة مباريات كرة القدم — مملكة الألعاب ============
// يحاكي مباراة 90 دقيقة بين تشكيلتين: أهداف بأسماء الهدافين والدقائق،
// إحصائيات كاملة (استحواذ/تسديدات/تمريرات/ركنيات)، وتقدم زمني للشريط المتحرك.
// الحساب مبني على قوة الكروت في مراكزها (هجوم/وسط/دفاع) — كل شيء من الخادم.

import type { PlayerCardData } from './cards-data'
import { cardPower } from './cards-data'

export interface MatchGoal {
  minute: number
  team: 'home' | 'away'
  scorer: string
  assist?: string
  type: 'normal' | 'header' | 'solo' | 'penalty'
}

export interface MatchTeamStats {
  possession: number
  shots: number
  onTarget: number
  passes: number
  corners: number
  rating: number
}

export interface MatchResult {
  scoreHome: number
  scoreAway: number
  goals: MatchGoal[] // مرتبة بالدقيقة
  stats: { home: MatchTeamStats; away: MatchTeamStats }
  scorersHome: Record<string, number>
  scorersAway: Record<string, number>
  teamRatingHome: number
  teamRatingAway: number
}

interface TeamStrength {
  att: number
  mid: number
  def: number
  rating: number
  attackers: PlayerCardData[]
  midfielders: PlayerCardData[]
  defenders: PlayerCardData[]
}

function analyzeSquad(cards: PlayerCardData[]): TeamStrength {
  const attackers: PlayerCardData[] = []
  const midfielders: PlayerCardData[] = []
  const defenders: PlayerCardData[] = []
  for (const c of cards) {
    if (['ST', 'RW', 'LW', 'RM'].includes(c.pos)) attackers.push(c)
    else if (['CAM', 'CM', 'CDM'].includes(c.pos)) midfielders.push(c)
    else defenders.push(c)
  }
  // لو التشكيلة كله مهاجمين مثلاً — وزّع من البقية
  if (!midfielders.length && (attackers.length || defenders.length)) midfielders.push(...(attackers.length ? attackers.slice(0, 2) : defenders.slice(0, 2)))
  if (!attackers.length) attackers.push(...(midfielders.slice(0, 2)))
  if (!defenders.length) defenders.push(...(midfielders.slice(0, 2)))
  const avg = (arr: PlayerCardData[]) => (arr.length ? arr.reduce((s, c) => s + cardPower(c), 0) / arr.length : 60)
  return {
    att: avg(attackers),
    mid: avg(midfielders),
    def: avg(defenders),
    rating: Math.round(cards.reduce((s, c) => s + c.rating, 0) / Math.max(1, cards.length)),
    attackers,
    midfielders,
    defenders,
  }
}

function weightedPick(cards: PlayerCardData[], weight: (c: PlayerCardData) => number, rng: () => number): PlayerCardData {
  const ws = cards.map(weight)
  const total = ws.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < cards.length; i++) {
    r -= ws[i]
    if (r <= 0) return cards[i]
  }
  return cards[cards.length - 1]
}

export function simulateMatch(homeCards: PlayerCardData[], awayCards: PlayerCardData[], rng: () => number = Math.random): MatchResult {
  const home = analyzeSquad(homeCards)
  const away = analyzeSquad(awayCards)

  // معدل الأهداف المتوقع لكل دقيقة (كرة قدم حقيقية ≈ 2.7 هدف/مباراة)
  const attHome = Math.pow(home.att / Math.max(20, away.def), 1.7)
  const attAway = Math.pow(away.att / Math.max(20, home.def), 1.7)
  const lamHome = 0.015 * Math.max(0.35, Math.min(2.4, attHome))
  const lamAway = 0.015 * Math.max(0.35, Math.min(2.4, attAway))

  const goals: MatchGoal[] = []
  for (let minute = 1; minute <= 90; minute++) {
    // وقت بدل الضائع: فرصة صغيرة في 45+/90+
    if (rng() < lamHome * (minute > 85 ? 1.8 : 1)) goals.push(makeGoal('home', minute, home, rng))
    if (rng() < lamAway * (minute > 85 ? 1.8 : 1)) goals.push(makeGoal('away', minute, away, rng))
  }
  goals.sort((a, b) => a.minute - b.minute)

  const scoreHome = goals.filter((g) => g.team === 'home').length
  const scoreAway = goals.filter((g) => g.team === 'away').length

  // الإحصائيات
  const possHome = Math.round(50 + ((home.mid - away.mid) / (home.mid + away.mid)) * 42 + (rng() - 0.5) * 6)
  const possession = Math.max(28, Math.min(72, possHome))
  const shotsBase = (s: TeamStrength) => Math.round(6 + s.att / 9 + rng() * 5)
  const shotsHome = shotsBase(home) + scoreHome * 2
  const shotsAway = shotsBase(away) + scoreAway * 2
  const onT = (shots: number, scored: number) => Math.max(scored, Math.round(shots * (0.38 + rng() * 0.18)))
  const passes = (s: TeamStrength) => Math.round(280 + s.mid * 3.2 + rng() * 60)
  const corners = () => Math.round(2 + rng() * 7)

  const stats = {
    home: {
      possession,
      shots: shotsHome,
      onTarget: onT(shotsHome, scoreHome),
      passes: passes(home),
      corners: corners(),
      rating: home.rating,
    },
    away: {
      possession: 100 - possession,
      shots: shotsAway,
      onTarget: onT(shotsAway, scoreAway),
      passes: passes(away),
      corners: corners(),
      rating: away.rating,
    },
  }

  const tally = (team: 'home' | 'away') => {
    const m: Record<string, number> = {}
    for (const g of goals.filter((x) => x.team === team)) m[g.scorer] = (m[g.scorer] || 0) + 1
    return m
  }

  return {
    scoreHome,
    scoreAway,
    goals,
    stats,
    scorersHome: tally('home'),
    scorersAway: tally('away'),
    teamRatingHome: home.rating,
    teamRatingAway: away.rating,
  }
}

function makeGoal(team: 'home' | 'away', minute: number, s: TeamStrength, rng: () => number): MatchGoal {
  // الهداف: الوزن للهجوم 74% ثم الوسط 22% والدفاع 4%
  const r = rng()
  let scorerCard: PlayerCardData
  if (r < 0.74) scorerCard = weightedPick(s.attackers, (c) => c.sho + c.rating * 0.5, rng)
  else if (r < 0.96) scorerCard = weightedPick(s.midfielders, (c) => c.sho + c.rating * 0.3, rng)
  else scorerCard = weightedPick(s.defenders, (c) => c.phy, rng)

  // نوع الهدف
  const tr = rng()
  let type: MatchGoal['type'] = 'normal'
  if (tr < 0.06) type = 'penalty'
  else if (tr < 0.2 && scorerCard.phy >= 70) type = 'header'
  else if (tr < 0.34 && scorerCard.dri >= 80) type = 'solo'

  // صناعة الهدف 65% من الوقت
  let assist: string | undefined
  if (type !== 'penalty' && rng() < 0.65) {
    const others = [...s.attackers, ...s.midfielders].filter((c) => c.name !== scorerCard.name)
    if (others.length) assist = weightedPick(others, (c) => c.pas, rng).name
  }
  return { minute, team, scorer: scorerCard.name, assist, type }
}

export const GOAL_TYPE_AR: Record<MatchGoal['type'], string> = {
  normal: '⚽',
  header: '🎯 رأسية',
  solo: '🏃 هدف فردي',
  penalty: '🥅 ركلة جزاء',
}
