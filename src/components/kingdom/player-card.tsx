'use client'

// ============ كرت اللاعب FC25 — مملكة الألعاب ============
// مطابق لكروت futbin.com/25/player الحقيقية:
// • الوجه الرسمي الشفاف (512×512 من cdn.futbin.com) بالمنتصف
// • التقييم + المركز + علم الدولة + شعار النادي أعلى اليسار (النسق الأصلي)
// • الإحصائيات عمودان × 3 صفوف: PAC/SHO/PAS يسار — DRI/DEF/PHY يمين
// • الحراس: DIV/HAN/KIC/REF/SPD/POS
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

// شكل كرت FC25: أعلى مستدير، جوانب مستقيمة، قاع مستدير الزوايا
const CARD_PATH =
  'M150 4 C 218 4, 266 9, 276 15 C 288 23, 293 40, 293 60 L 293 352 C 293 394, 256 424, 150 424 C 44 424, 7 394, 7 352 L 7 60 C 7 40, 12 23, 24 15 C 34 9, 82 4, 150 4 Z'

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
  // العمود الأيسر PAC/SHO/PAS (أو DIV/HAN/KIC) — الأيمن DRI/DEF/PHY (أو REF/SPD/POS)
  const leftStats = [0, 1, 2].map((i) => ({ v: [card.pac, card.sho, card.pas, card.dri, card.def, card.phy][i], l: labels[i] }))
  const rightStats = [3, 4, 5].map((i) => ({ v: [card.pac, card.sho, card.pas, card.dri, card.def, card.phy][i], l: labels[i] }))
  const gold = card.rating >= 90 // نسخة أنعم وألمع للنجوم

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
          {/* جسم الكرت الذهبي — تدرج FC25 الرسمي */}
          <linearGradient id={`bg-${id}`} x1="0" y1="0" x2="0.65" y2="1">
            <stop offset="0%" stopColor={gold ? '#fdf3c4' : '#f7e9ae'} />
            <stop offset="18%" stopColor={gold ? '#f3e194' : '#eed88f'} />
            <stop offset="42%" stopColor={gold ? '#e3c26a' : '#dcbd61'} />
            <stop offset="70%" stopColor={gold ? '#caa045' : '#c39a3d'} />
            <stop offset="100%" stopColor={gold ? '#a37a28' : '#9c742a'} />
          </linearGradient>
          {/* لمعان قُطري — نسق المعدن الأصلي */}
          <linearGradient id={`sheen-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.30" />
            <stop offset="22%" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="45%" stopColor="#ffffff" stopOpacity="0.16" />
            <stop offset="63%" stopColor="#ffffff" stopOpacity="0.02" />
            <stop offset="84%" stopColor="#ffffff" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          {/* حواف الكرت */}
          <linearGradient id={`bd-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9d7823" />
            <stop offset="35%" stopColor="#d8b45c" />
            <stop offset="70%" stopColor="#ab8430" />
            <stop offset="100%" stopColor="#7a5a16" />
          </linearGradient>
          {/* تلاشي أسفل الصورة فوق منطقة الاسم */}
          <linearGradient id={`fade-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#caa045" stopOpacity="0" />
            <stop offset="55%" stopColor="#c39a3d" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#a37a28" stopOpacity="0.85" />
          </linearGradient>
          <clipPath id={`clip-${id}`}>
            <path d={CARD_PATH} />
          </clipPath>
        </defs>

        <g clipPath={`url(#clip-${id})`}>
          <rect width="300" height="430" fill={`url(#bg-${id})`} />
          <rect width="300" height="430" fill={`url(#sheen-${id})`} />

          {/* الوجه الرسمي الشفاف — منتصف الكرت */}
          {showPhoto && (
            <image
              href={card.photo}
              x="45"
              y="8"
              width="210"
              height="210"
              preserveAspectRatio="xMidYMin meet"
              onError={() => setImgFailed(true)}
            />
          )}
          {!showPhoto && (
            <g opacity="0.55">
              <circle cx="150" cy="96" r="50" fill="#8a651a" />
              <path d="M62 218 C 62 150, 238 150, 238 218 L 238 228 L 62 228 Z" fill="#8a651a" />
            </g>
          )}

          {/* تلاشٍ خفيف أسفل الوجه */}
          <rect x="0" y="180" width="300" height="140" fill={`url(#fade-${id})`} />
        </g>

        {/* الإطار */}
        <path d={CARD_PATH} fill="none" stroke={`url(#bd-${id})`} strokeWidth="5" />
        <path d={CARD_PATH} fill="none" stroke="#fff4c8" strokeWidth="1.1" opacity="0.5" transform="translate(0 0) scale(0.972) translate(4.2 6)" />

        {/* التقييم + المركز — أعلى اليسار (نسق futbin) */}
        <text x="30" y="62" fill="#47310a" fontSize="42" fontWeight="900" fontFamily="Arial Black, Arial, sans-serif">
          {card.rating}
        </text>
        <text x="30" y="85" fill="#47310a" fontSize="17" fontWeight="800" fontFamily="Arial, sans-serif">
          {card.pos}
        </text>

        {/* علم الدولة */}
        <text x="34" y="116" fontSize="21" textAnchor="middle">
          {card.nation}
        </text>

        {/* شعار النادي الرسمي (من futbin) أو اسم النادي */}
        {card.clubId ? (
          <image href={`/cards/clubs/${card.clubId}.png`} x="18" y="126" width="34" height="34" preserveAspectRatio="xMidYMid meet" />
        ) : (
          <text x="35" y="151" textAnchor="middle" fill="#47310a" fontSize="11" fontWeight="900" fontFamily="Arial, sans-serif">
            {card.club === 'Icon' ? '★' : ''}
          </text>
        )}

        {/* الاسم */}
        <text
          x="150"
          y="272"
          textAnchor="middle"
          fill="#ffffff"
          fontSize={card.name.length > 14 ? 19 : card.name.length > 10 ? 22 : 25}
          fontWeight="900"
          fontFamily="Arial, sans-serif"
          style={{ paintOrder: 'stroke', letterSpacing: '0.5px' }}
          stroke="#5c3d08"
          strokeWidth="3"
        >
          {card.name}
        </text>

        {/* الإحصائيات — عمودان × 3 صفوف مثل الكرت الأصلي */}
        {[leftStats, rightStats].map((col, ci) =>
          col.map((s, ri) => (
            <g key={s.l + ci}>
              <text
                x={ci === 0 ? 118 : 202}
                y={292 + ri * 34}
                textAnchor="end"
                fill="#ffffff"
                fontSize="20"
                fontWeight="900"
                fontFamily="Arial, sans-serif"
                style={{ paintOrder: 'stroke' }}
                stroke="#5c3d08"
                strokeWidth="2.4"
              >
                {s.v}
              </text>
              <text
                x={ci === 0 ? 124 : 208}
                y={292 + ri * 34}
                textAnchor="start"
                fill="#47310a"
                fontSize="12.5"
                fontWeight="800"
                fontFamily="Arial, sans-serif"
              >
                {s.l}
              </text>
            </g>
          )),
        )}

        {/* توقيع الملكية أسفل الكرت */}
        <text x="150" y="408" textAnchor="middle" fill="#47310a" fontSize="11" fontWeight="800" opacity="0.85" fontFamily="Arial, sans-serif">
          {card.club === 'Icon' ? '⭐ ICON ⭐' : ''}
        </text>
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
            <path d={CARD_PATH} />
          </clipPath>
        </defs>
        <g clipPath={`url(#mclip-${uid})`}>
          <rect width="300" height="430" fill={`url(#mbg-${uid})`} />
          <ellipse cx="150" cy="180" rx="130" ry="120" fill="#6d28d9" opacity="0.14" />
        </g>
        <path d={CARD_PATH} fill="none" stroke={`url(#mbd-${uid})`} strokeWidth="6" />
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
