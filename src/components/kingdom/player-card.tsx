'use client'

// ============ كرت اللاعب — مملكة الألعاب ============
// نسخة مطابقة لتصميم كروت FUTTIES المرفوعة: إطار ذهبي مزخرف، خلفية متدرجة
// مع دوامات، تقييم ومركز أعلى اليسار، أسماء وإحصائيات أسفل، وشريط نجوم.
// 3 مستويات حسب التقييم: FUTTIES (95+) / ذهبي (88-94) / فضي-أزرق (80-87)
// + وضع "مجهول" (كرت أسود غامض للعبة اللاعب المجهول)

import { useState } from 'react'
import type { PlayerCardData } from '@/lib/cards-data'

interface Props {
  card?: PlayerCardData | null
  size?: number // العرض بالبكسل (الارتفاع = 1.4×)
  variant?: 'normal' | 'mystery'
  glow?: boolean
  className?: string
  onClick?: () => void
  selected?: boolean
}

const TIER = {
  futties: {
    // 95+ — وردية/ذهبية مثل كروت ميسي وصلاح ورونالدو
    border: ['#f6e3b8', '#c9992e', '#8a5a13', '#e8c56d'],
    bg1: '#ff2d8f',
    bg2: '#ff7ab8',
    bg3: '#ff9d5c',
    accent: '#ec4899',
  },
  gold: {
    // 88-94 — ذهبية كلاسيكية مثل كرت مبابي
    border: ['#f7e9c0', '#d4af37', '#8a6d1d', '#e5c860'],
    bg1: '#f5d060',
    bg2: '#e3b53a',
    bg3: '#caa02a',
    accent: '#b8860b',
  },
  rare: {
    // 80-87 — أزرق داكن فخم
    border: ['#dbe4f3', '#8fa3c8', '#3c5379', '#b8c6e0'],
    bg1: '#2b4c8c',
    bg2: '#1d3a75',
    bg3: '#4a6fb5',
    accent: '#3b82f6',
  },
} as const

function tierOf(rating: number): keyof typeof TIER {
  if (rating >= 95) return 'futties'
  if (rating >= 88) return 'gold'
  return 'rare'
}

// شكل الدرع: قمة خفيفة في المنتصف، أكتاف مستديرة، قاع ضيق مستدير
const SHIELD_PATH =
  'M150 8 C 170 2, 200 4, 226 10 C 248 15, 264 16, 278 12 C 288 34, 292 60, 290 92 C 296 170, 288 268, 268 322 C 252 366, 214 400, 150 412 C 86 400, 48 366, 32 322 C 12 268, 4 170, 10 92 C 8 60, 12 34, 22 12 C 36 16, 52 15, 74 10 C 100 4, 130 2, 150 8 Z'

export function PlayerCard({ card, size = 200, variant = 'normal', glow = false, className = '', onClick, selected = false }: Props) {
  const [imgFailed, setImgFailed] = useState(false)
  const w = size
  const h = Math.round(size * 1.4)
  const id = card?.id || 'mystery'

  if (variant === 'mystery' || !card) {
    return <MysteryCard w={w} h={h} className={className} onClick={onClick} selected={selected} />
  }

  const t = TIER[tierOf(card.rating)]
  const gradId = `bg-${id}`
  const borderId = `bd-${id}`
  const clipId = `clip-${id}`
  const swirlId = `sw-${id}`
  const showFull = card.img && !imgFailed
  const showPhoto = !card.img && card.photo && !imgFailed

  return (
    <div
      className={`relative select-none ${onClick ? 'cursor-pointer transition-transform duration-200 hover:scale-[1.04]' : ''} ${className}`}
      style={{ width: w, height: h, filter: selected ? 'drop-shadow(0 0 14px rgba(250,204,21,.8))' : glow ? `drop-shadow(0 0 10px ${t.accent}88)` : undefined }}
      onClick={onClick}
    >
      <svg viewBox="0 0 300 420" width={w} height={h} className="block">
        <defs>
          <linearGradient id={borderId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={t.border[0]} />
            <stop offset="35%" stopColor={t.border[1]} />
            <stop offset="65%" stopColor={t.border[2]} />
            <stop offset="100%" stopColor={t.border[3]} />
          </linearGradient>
          <radialGradient id={gradId} cx="50%" cy="38%" r="80%">
            <stop offset="0%" stopColor={t.bg2} />
            <stop offset="55%" stopColor={t.bg1} />
            <stop offset="100%" stopColor={t.bg3} />
          </radialGradient>
          <filter id={swirlId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <clipPath id={clipId}>
            <path d={SHIELD_PATH} />
          </clipPath>
          <linearGradient id={`namegrad-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.55" />
          </linearGradient>
        </defs>

        {/* الخلفية السوداء خلف الدرع */}
        <rect x="0" y="0" width="300" height="420" fill="#0a0a0f" />

        {/* الدرع الداخلي */}
        <g clipPath={`url(#${clipId})`}>
          <rect width="300" height="420" fill={`url(#${gradId})`} />
          {/* دوامات ضوئية مثل الكروت الأصلية */}
          <ellipse cx="80" cy="150" rx="130" ry="60" fill="#ffffff" opacity="0.18" filter={`url(#${swirlId})`} transform="rotate(-24 80 150)" />
          <ellipse cx="230" cy="240" rx="140" ry="55" fill={t.bg3} opacity="0.5" filter={`url(#${swirlId})`} transform="rotate(18 230 240)" />
          <ellipse cx="140" cy="330" rx="150" ry="70" fill="#ffffff" opacity="0.10" filter={`url(#${swirlId})`} transform="rotate(-12 140 330)" />

          {/* صورة اللاعب أو صورة الكرت الكامل */}
          {showFull && (
            <image href={card.img} x="0" y="0" width="300" height="420" preserveAspectRatio="xMidYMid slice" onError={() => setImgFailed(true)} />
          )}
          {showPhoto && (
            <image href={card.photo} x="45" y="55" width="210" height="270" preserveAspectRatio="xMidYMin slice" onError={() => setImgFailed(true)} />
          )}

          {/* ظل سفلي للنصوص */}
          {!showFull && <rect x="0" y="240" width="300" height="180" fill={`url(#namegrad-${id})`} />}
        </g>

        {/* الإطار الذهبي المزدوج */}
        <path d={SHIELD_PATH} fill="none" stroke={`url(#${borderId})`} strokeWidth="10" />

        {!showFull && (
          <>
            {/* التقييم والمركز أعلى اليسار */}
            <text x="38" y="64" fill="#ffffff" fontSize="44" fontWeight="900" fontFamily="system-ui, -apple-system, sans-serif" style={{ paintOrder: 'stroke' }} stroke="#00000066" strokeWidth="1">
              {card.rating}
            </text>
            <text x="38" y="86" fill="#ffffff" fontSize="17" fontWeight="800" style={{ paintOrder: 'stroke' }} stroke="#00000066" strokeWidth="0.8">
              {card.pos}
            </text>
            {card.alt && card.alt.length > 0 && (
              <text x="70" y="86" fill="#ffffffcc" fontSize="15" fontWeight="800">
                ++
              </text>
            )}

            {/* الشارات الجانبية (مراكز بديلة) */}
            {card.alt?.map((p, i) => (
              <g key={p} transform={`translate(10, ${108 + i * 30})`}>
                <rect width="34" height="26" rx="6" fill={t.accent} stroke="#ffffff88" strokeWidth="1" />
                <text x="17" y="18" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="800">
                  {p}
                </text>
              </g>
            ))}

            {/* الاسم */}
            <text x="150" y="298" textAnchor="middle" fill="#ffffff" fontSize={card.name.length > 12 ? 22 : 27} fontWeight="900" fontFamily="system-ui, -apple-system, sans-serif" style={{ paintOrder: 'stroke', letterSpacing: '.5px' }} stroke="#000000aa" strokeWidth="3">
              {card.name}
            </text>

            {/* الإحصائيات */}
            <g fontSize="12.5" fontWeight="700" fill="#ffffff">
              {(
                [
                  ['PAC', card.pac],
                  ['SHO', card.sho],
                  ['PAS', card.pas],
                  ['DRI', card.dri],
                  ['DEF', card.def],
                  ['PHY', card.phy],
                ] as const
              ).map(([label, val], i) => (
                <g key={label}>
                  <text x={36 + i * 39} y={326} fill="#ffffffdd" fontSize="11.5" fontWeight="700" textAnchor="middle">
                    {label}
                  </text>
                  <text x={36 + i * 39} y={342} textAnchor="middle" fontSize="14" fontWeight="900" style={{ paintOrder: 'stroke' }} stroke="#00000088" strokeWidth="1.4">
                    {val}
                  </text>
                </g>
              ))}
            </g>

            {/* العلم والنادي */}
            <text x="128" y="368" textAnchor="middle" fontSize="17">
              {card.nation}
            </text>
            <text x="172" y="368" textAnchor="middle" fill="#ffffffee" fontSize="11.5" fontWeight="700" style={{ paintOrder: 'stroke' }} stroke="#00000099" strokeWidth="1.6">
              {card.club}
            </text>

            {/* شريط النجوم */}
            <g transform="translate(150, 392)">
              <rect x="-52" y="-12" width="104" height="22" rx="6" fill={t.accent} stroke="#ffffff66" strokeWidth="1" />
              <text textAnchor="middle" y="5" fill="#fff" fontSize="12" fontWeight="900">
                ★ {Math.max(3, Math.min(5, Math.round((card.rating - 76) / 5)))} ★
              </text>
            </g>
          </>
        )}
      </svg>
    </div>
  )
}

// ============ الكرت المجهول الأسود ============
export function MysteryCard({ w, h, className = '', onClick, selected = false }: { w: number; h: number; className?: string; onClick?: () => void; selected?: boolean }) {
  return (
    <div
      className={`relative select-none ${onClick ? 'cursor-pointer transition-transform duration-200 hover:scale-[1.04]' : ''} ${className}`}
      style={{ width: w, height: h, filter: selected ? 'drop-shadow(0 0 16px rgba(168,85,247,.85))' : 'drop-shadow(0 4px 10px #0008)' }}
      onClick={onClick}
    >
      <svg viewBox="0 0 300 420" width={w} height={h} className="block">
        <defs>
          <linearGradient id="myst-border" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7b5cd6" />
            <stop offset="40%" stopColor="#2e1a5e" />
            <stop offset="70%" stopColor="#0c0618" />
            <stop offset="100%" stopColor="#9a6cf5" />
          </linearGradient>
          <radialGradient id="myst-bg" cx="50%" cy="40%" r="75%">
            <stop offset="0%" stopColor="#241242" />
            <stop offset="60%" stopColor="#120a24" />
            <stop offset="100%" stopColor="#05030c" />
          </radialGradient>
          <clipPath id="myst-clip">
            <path d={SHIELD_PATH} />
          </clipPath>
        </defs>
        <rect width="300" height="420" fill="#050308" />
        <g clipPath="url(#myst-clip)">
          <rect width="300" height="420" fill="url(#myst-bg)" />
          <ellipse cx="150" cy="200" rx="150" ry="110" fill="#6d28d9" opacity="0.16" />
        </g>
        <path d={SHIELD_PATH} fill="none" stroke="url(#myst-border)" strokeWidth="10" />
        <text x="150" y="210" textAnchor="middle" fill="#c4b5fd" fontSize="110" fontWeight="900" opacity="0.9">
          ؟
        </text>
        <text x="150" y="268" textAnchor="middle" fill="#a78bfa" fontSize="17" fontWeight="800">
          اللاعب المجهول
        </text>
        <g transform="translate(150, 392)">
          <rect x="-52" y="-12" width="104" height="22" rx="6" fill="#5b21b6" stroke="#a78bfa66" strokeWidth="1" />
          <text textAnchor="middle" y="5" fill="#e9d5ff" fontSize="12" fontWeight="900">
            ★ ★ ★ ★ ★
          </text>
        </g>
      </svg>
    </div>
  )
}
