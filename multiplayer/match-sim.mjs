// محرك محاكاة المباراة — نسخة JS مطابقة لـ src/lib/match-engine.ts
// تُستخدم في غرف الأونلاين (المزاد/المجهول) بين لاعبين حقيقيين

const cards = (await import('./cards-data.json', { with: { type: 'json' } })).default

const CARD_BY_ID = new Map(cards.map((c) => [c.id, c]))

export function cardPower(c) {
  if (c.gk) return Math.round(c.dri * 0.3 + c.pac * 0.25 + c.sho * 0.25 + c.phy * 0.2)
  const roleSho = ['ST', 'RW', 'LW', 'CAM', 'RM'].includes(c.pos)
  const roleDef = ['CB', 'RB', 'LB', 'CDM'].includes(c.pos)
  if (roleSho) return Math.round(c.sho * 0.4 + c.dri * 0.25 + c.pac * 0.2 + c.pas * 0.15)
  if (roleDef) return Math.round(c.def * 0.5 + c.phy * 0.25 + c.pac * 0.15 + c.pas * 0.1)
  return Math.round(c.pas * 0.35 + c.dri * 0.3 + c.sho * 0.15 + c.def * 0.1 + c.pac * 0.1)
}

function analyzeSquad(list) {
  const attackers = []
  const midfielders = []
  const defenders = []
  for (const c of list) {
    if (['ST', 'RW', 'LW', 'RM'].includes(c.pos)) attackers.push(c)
    else if (['CAM', 'CM', 'CDM'].includes(c.pos)) midfielders.push(c)
    else defenders.push(c)
  }
  if (!midfielders.length && (attackers.length || defenders.length)) midfielders.push(...(attackers.length ? attackers.slice(0, 2) : defenders.slice(0, 2)))
  if (!attackers.length) attackers.push(...midfielders.slice(0, 2))
  if (!defenders.length) defenders.push(...midfielders.slice(0, 2))
  const avg = (arr) => (arr.length ? arr.reduce((s, c) => s + cardPower(c), 0) / arr.length : 60)
  return {
    att: avg(attackers),
    mid: avg(midfielders),
    def: avg(defenders),
    rating: Math.round(list.reduce((s, c) => s + c.rating, 0) / Math.max(1, list.length)),
    attackers,
    midfielders,
    defenders,
  }
}

function weightedPick(list, weight, rng) {
  const ws = list.map(weight)
  const total = ws.reduce((a, b) => a + b, 0)
  let r = rng() * total
  for (let i = 0; i < list.length; i++) {
    r -= ws[i]
    if (r <= 0) return list[i]
  }
  return list[list.length - 1]
}

function makeGoal(team, minute, s, rng) {
  // الحارس لا يسجل — الوزن للهجوم 74% ثم الوسط 22% والدفاع 4%
  const r = rng()
  let scorerCard
  if (r < 0.74) scorerCard = weightedPick(s.attackers, (c) => c.sho + c.rating * 0.5, rng)
  else if (r < 0.96) scorerCard = weightedPick(s.midfielders, (c) => c.sho + c.rating * 0.3, rng)
  else {
    const fieldDef = s.defenders.filter((c) => !c.gk)
    scorerCard = weightedPick(fieldDef.length ? fieldDef : s.defenders, (c) => c.phy, rng)
  }

  const tr = rng()
  let type = 'normal'
  if (tr < 0.06) type = 'penalty'
  else if (tr < 0.2 && scorerCard.phy >= 70) type = 'header'
  else if (tr < 0.34 && scorerCard.dri >= 80) type = 'solo'

  let assist
  if (type !== 'penalty' && rng() < 0.65) {
    const others = [...s.attackers, ...s.midfielders].filter((c) => c.name !== scorerCard.name)
    if (others.length) assist = weightedPick(others, (c) => c.pas, rng).name
  }
  return { minute, team, scorer: scorerCard.name, assist, type }
}

export function simulateMatch(homeList, awayList, rng = Math.random) {
  const home = analyzeSquad(homeList)
  const away = analyzeSquad(awayList)

  const attHome = Math.pow(home.att / Math.max(20, away.def), 1.7)
  const attAway = Math.pow(away.att / Math.max(20, home.def), 1.7)
  const lamHome = 0.015 * Math.max(0.35, Math.min(2.4, attHome))
  const lamAway = 0.015 * Math.max(0.35, Math.min(2.4, attAway))

  const goals = []
  for (let minute = 1; minute <= 90; minute++) {
    if (rng() < lamHome * (minute > 85 ? 1.8 : 1)) goals.push(makeGoal('home', minute, home, rng))
    if (rng() < lamAway * (minute > 85 ? 1.8 : 1)) goals.push(makeGoal('away', minute, away, rng))
  }
  goals.sort((a, b) => a.minute - b.minute)

  const scoreHome = goals.filter((g) => g.team === 'home').length
  const scoreAway = goals.filter((g) => g.team === 'away').length

  const possHome = Math.round(50 + ((home.mid - away.mid) / (home.mid + away.mid)) * 42 + (rng() - 0.5) * 6)
  const possession = Math.max(28, Math.min(72, possHome))
  const shotsBase = (s) => Math.round(6 + s.att / 9 + rng() * 5)
  const shotsHome = shotsBase(home) + scoreHome * 2
  const shotsAway = shotsBase(away) + scoreAway * 2
  const onT = (shots, scored) => Math.max(scored, Math.round(shots * (0.38 + rng() * 0.18)))
  const passes = (s) => Math.round(280 + s.mid * 3.2 + rng() * 60)
  const corners = () => Math.round(2 + rng() * 7)

  const tally = (team) => {
    const m = {}
    for (const g of goals.filter((x) => x.team === team)) m[g.scorer] = (m[g.scorer] || 0) + 1
    return m
  }

  return {
    scoreHome,
    scoreAway,
    goals,
    stats: {
      home: { possession, shots: shotsHome, onTarget: onT(shotsHome, scoreHome), passes: passes(home), corners: corners(), rating: home.rating },
      away: { possession: 100 - possession, shots: shotsAway, onTarget: onT(shotsAway, scoreAway), passes: passes(away), corners: corners(), rating: away.rating },
    },
    scorersHome: tally('home'),
    scorersAway: tally('away'),
    teamRatingHome: home.rating,
    teamRatingAway: away.rating,
  }
}

export function cardsByIds(ids) {
  return ids.map((id) => CARD_BY_ID.get(id)).filter(Boolean)
}
