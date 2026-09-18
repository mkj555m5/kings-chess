'use client'

// ============ كرت اللاعب FC25 — مملكة الألعاب ============
// قالب ذهبي موحد مطابق لكروت FC25 الحقيقية: درع ذهبي معدني،
// تقييم ومركز أعلى اليسار، صورة اللاعب بدمج ناعم، الإحصائيات والعلم والنادي
// حراس المرمى يعرضون: DIV HAN KIC REF SPD POS
// + وضع "مجهول" (كرت أسود غامض للعبة اللاعب المجهول)

import { useId, useState } from 'react'
import type { PlayerCardData } from '@/lib/cards-data'

interface Props {
  card?: PlayerCardData | null
  size?: number // العرض بالبكسل (الارتفاع = 1.43×)
  variant?: 'normal' | 'mystery'
  glow?: boolean
  className?: string
  onClick?: () => void
  selected?: boolean
}

// شكل درع FC25: قمة ناعمة، أكتاف مستديرة، قاع مدبب أنيق
const SHIELD_PATH =
  'M150 8 C 196 3, 244 11, 264 24 C 273 31, 277 43, 276 56 C 281 130, 277 232, 260 300 C 249 349, 214 392, 150 420 C 86 392, 51 349, 40 300 C 23 232, 19 130, 24 56 C 23 43, 27 31, 36 24 C 56 11, 104 3, 150 8 Z'

// تسميات الإحصائيات — لاعبي المناصب / الحراس
const STAT_LABELS = ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY']
const GK_STAT_LABELS = ['DIV', 'HAN', 'KIC', 'REF', 'SPD', 'POS']

export function PlayerCard({ card, size = 200, variant = 'normal', glow = false, className = '', onClick, selected = false }: Props) {
  const [imgFailed, setImgFailed] = useState(false)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const w = size
  const h = Math.round(size * 1.43)

  if (variant === 'mystery' || !card) {
    return <MysteryCard size={w} className={className} onClick={onClick} selected={selected} />
  }

  const id = `${card.id}-${uid}`
  const showPhoto = !!card.photo && !imgFailed
  const labels = card.gk ? GK_STAT_LABELS : STAT_LABELS
  const stats = [card.pac, card.sho, card.pas, card.dri, card.def, card.phy]
  const stars = Math.max(1, Math.min(5, Math.round((card.rating - 74) / 5)))

  return (
    <div
      className={`relative select-none ${onClick ? 'cursor-pointer transition-transform duration-200 hover:scale-[1.04]' : ''} ${className}`}
      style={{
        width: w,
        height: h,
        filter: selected
          ? 'drop-shadow(0 0 14px rgba(250,204,21,.85))'
          : glow
            ? 'drop-shadow(0 0 12px rgba(250,204,21,.5)) drop-shadow(0 6px 14px rgba(0,0,0,.55))'
            : 'drop-shadow(0 5px 12px rgba(0,0,0,.5))',
      }}
      onClick={onClick}
    >
      <svg viewBox="0 0 300 430" width={w} height={h} className="block">
        <defs>
          {/* الجسم الذهبي المعدني */}
          <radialGradient id={`bg-${id}`} cx="50%" cy="30%" r="95%">
            <stop offset="0%" stopColor="#f9ecc0" />
            <stop offset="28%" stopColor="#f0d98a" />
            <stop offset="58%" stopColor="#dcb95c" />
            <stop offset="82%" stopColor="#b98e2f" />
            <stop offset="100%" stopColor="#8a651a" />
          </radialGradient>
          {/* لمعان قطري مثل المعدن المطرَّق */}
          <linearGradient id={`sheen-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.34" />
            <stop offset="24%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="46%" stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="62%" stopColor="#ffffff" stopOpacity="0.03" />
            <stop offset="82%" stopColor="#ffffff" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.02" />
          </linearGradient>
          {/* إطار خارجي ذهبي داكن */}
          <linearGradient id={`bd-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8a6a1f" />
            <stop offset="30%" stopColor="#c9a227" />
            <stop offset="70%" stopColor="#a37f22" />
            <stop offset="100%" stopColor="#6b4f14" />
          </linearGradient>
          {/* تعتيم أسفل الاسم والإحصائيات */}
          <linearGradient id={`fade-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5c3d08" stopOpacity="0" />
            <stop offset="55%" stopColor="#4a3005" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#3a2503" stopOpacity="0.6" />
          </linearGradient>
          {/* قناع دمج الصورة البيضاوي الناعم */}
          <radialGradient id={`pm-${id}`} cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="62%" stopColor="#ffffff" />
            <stop offset="82%" stopColor="#ffffff" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <clipPath id={`clip-${id}`}>
            <path d={SHIELD_PATH} />
          </clipPath>
          <mask id={`mask-${id}`}>
            <ellipse cx="150" cy="136" rx="116" ry="112" fill={`url(#pm-${id})`} />
          </mask>
        </defs>

        {/* خلفية شفافة خارج الدرع */}
        <rect width="300" height="430" fill="transparent" />

        <g clipPath={`url(#clip-${id})`}>
          {/* الجسم الذهبي */}
          <rect width="300" height="430" fill={`url(#bg-${id})`} />
          {/* لمعة قطرية */}
          <rect width="300" height="430" fill={`url(#sheen-${id})`} />

          {/* صورة اللاعب بدمج ناعم */}
          {showPhoto && (
            <image
              href={card.photo}
              x="26"
              y="18"
              width="248"
              height="230"
              preserveAspectRatio="xMidYMin slice"
              mask={`url(#mask-${id})`}
              onError={() => setImgFailed(true)}
            />
          )}
          {/* بديل نصي إن فشلت الصورة: صورة ظلية */}
          {!showPhoto && (
            <g opacity="0.5">
              <circle cx="150" cy="118" r="52" fill="#8a651a" />
              <path d="M60 250 C 60 175, 240 175, 240 250 L 240 260 L 60 260 Z" fill="#8a651a" />
            </g>
          )}

          {/* تعتيم سفلي ناعم */}
          <rect x="0" y="200" width="300" height="230" fill={`url(#fade-${id})`} />
        </g>

        {/* الإطار الخارجي + الخط الداخلي الفاتح */}
        <path d={SHIELD_PATH} fill="none" stroke={`url(#bd-${id})`} strokeWidth="7" />
        <path d={SHIELD_PATH} fill="none" stroke="#fff7d6" strokeWidth="1.4" opacity="0.65" transform="translate(0 0) scale(0.955) translate(6.8 9.7)" />
        <path d={SHIELD_PATH} fill="none" stroke="#3f2c05" strokeWidth="1" opacity="0.5" transform="translate(0 0) scale(0.985) translate(2.2 3.2)" />

        {/* التقييم والمركز أعلى اليسار */}
        <text x="34" y="66" fill="#ffffff" fontSize="42" fontWeight="900" fontFamily="Arial Black, Arial, sans-serif" style={{ paintOrder: 'stroke' }} stroke="#4a300508" strokeWidth="0">
          {card.rating}
        </text>
        <text x="34" y="88" fill="#ffffff" fontSize="16.5" fontWeight="800" fontFamily="Arial, sans-serif" style={{ paintOrder: 'stroke' }}>
          {card.pos}
        </text>
        {/* علامة + + (أفضل نسخة) */}
        {card.alt && card.alt.length > 0 && (
          <text x="34" y="106" fill="#fff8d9" fontSize="13" fontWeight="900" opacity="0.95">
            + +
          </text>
        )}

        {/* المراكز البديلة — شرائح يسار الدرع */}
        {card.alt?.map((p, i) => (
          <g key={p} transform={`translate(8, ${124 + i * 28})`}>
            <rect width="30" height="22" rx="5" fill="#3a2503" opacity="0.55" stroke="#f3e2a4" strokeWidth="0.8" />
            <text x="15" y="15.5" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="800">
              {p}
            </text>
          </g>
        ))}

        {/* الاسم */}
        <text
          x="150"
          y="277"
          textAnchor="middle"
          fill="#ffffff"
          fontSize={card.name.length > 14 ? 20 : card.name.length > 10 ? 23 : 26}
          fontWeight="900"
          fontFamily="Arial, sans-serif"
          style={{ paintOrder: 'stroke', letterSpacing: '0.5px' }}
          stroke="#3a2503"
          strokeWidth="3.5"
        >
          {card.name}
        </text>

        {/* خط فاصل رفيع */}
        <line x1="62" y1="288" x2="238" y2="288" stroke="#fff7d6" strokeWidth="1" opacity="0.4" />

        {/* الإحصائيات الست */}
        {stats.map((v, i) => (
          <g key={labels[i]}>
            <text x={52 + i * 39.2} y="309" textAnchor="middle" fill="#f7ecc8" fontSize="10.5" fontWeight="700" fontFamily="Arial, sans-serif">
              {labels[i]}
            </text>
            <text
              x={52 + i * 39.2}
              y="327"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="16"
              fontWeight="900"
              fontFamily="Arial, sans-serif"
              style={{ paintOrder: 'stroke' }}
              stroke="#3a2503"
              strokeWidth="2.2"
            >
              {v}
            </text>
          </g>
        ))}

        {/* العلم والنادي */}
        <text x="118" y="356" textAnchor="middle" fontSize="19">
          {card.nation}
        </text>
        <text
          x="133"
          y="355"
          fill="#ffffff"
          fontSize="11.5"
          fontWeight="700"
          fontFamily="Arial, sans-serif"
          style={{ paintOrder: 'stroke' }}
          stroke="#3a2503"
          strokeWidth="2"
        >
          {card.club}
        </text>

        {/* شريط النجوم السفلي */}
        <g transform="translate(150, 384)">
          <rect x="-50" y="-13" width="100" height="25" rx="12" fill="#3a2503" opacity="0.6" stroke="#f3e2a4" strokeWidth="0.9" />
          <text textAnchor="middle" y="5.5" fill="#ffd75e" fontSize="13.5" fontWeight="900">
            {'★'.repeat(stars)}
          </text>
        </g>
      </svg>
    </div>
  )
}

// ============ الكرت المجهول الأسود — بنفس شكل FC25 ============
export function MysteryCard({ size = 200, className = '', onClick, selected = false }: { size?: number; className?: string; onClick?: () => void; selected?: boolean }) {
  const w = size
  const h = Math.round(size * 1.43)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  return (
    <div
      className={`relative select-none ${onClick ? 'cursor-pointer transition-transform duration-200 hover:scale-[1.04]' : ''} ${className}`}
      style={{ width: w, height: h, filter: selected ? 'drop-shadow(0 0 16px rgba(168,85,247,.9))' : 'drop-shadow(0 5px 12px rgba(0,0,0,.55))' }}
      onClick={onClick}
    >
      <svg viewBox="0 0 300 430" width={w} height={h} className="block">
        <defs>
          <radialGradient id={`mbg-${uid}`} cx="50%" cy="32%" r="95%">
            <stop offset="0%" stopColor="#3b2a6b" />
            <stop offset="40%" stopColor="#1e1240" />
            <stop offset="75%" stopColor="#0e0824" />
            <stop offset="100%" stopColor="#05030c" />
          </radialGradient>
          <linearGradient id={`mbd-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9a6cf5" />
            <stop offset="45%" stopColor="#5b21b6" />
            <stop offset="100%" stopColor="#2e1065" />
          </linearGradient>
          <clipPath id={`mclip-${uid}`}>
            <path d={SHIELD_PATH} />
          </clipPath>
        </defs>
        <g clipPath={`url(#mclip-${uid})`}>
          <rect width="300" height="430" fill={`url(#mbg-${uid})`} />
          <ellipse cx="150" cy="180" rx="130" ry="120" fill="#6d28d9" opacity="0.14" />
        </g>
        <path d={SHIELD_PATH} fill="none" stroke={`url(#mbd-${uid})`} strokeWidth="7" />
        <text x="150" y="235" textAnchor="middle" fill="#c4b5fd" fontSize="120" fontWeight="900" opacity="0.92">
          ؟
        </text>
        <text x="150" y="290" textAnchor="middle" fill="#a78bfa" fontSize="17" fontWeight="800" fontFamily="Arial, sans-serif">
          اللاعب المجهول
        </text>
        <g transform="translate(150, 384)">
          <rect x="-50" y="-13" width="100" height="25" rx="12" fill="#1e1240" stroke="#a78bfa66" strokeWidth="0.9" />
          <text textAnchor="middle" y="5.5" fill="#d8b4fe" fontSize="13.5" fontWeight="900">
            ★ ★ ★
          </text>
        </g>
      </svg>
    </div>
  )
}
