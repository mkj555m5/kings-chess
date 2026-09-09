'use client'

// مجموعة قطع الشطرنج - رموز يونيكود ممتلئة داخل SVG مع حدود متباينة
// تضمن مظهراً أنيقاً ومتناسقاً على كل الأنظمة
import type { JSX } from 'react'

export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'

const GLYPH: Record<PieceType, string> = {
  k: '\u265A',
  q: '\u265B',
  r: '\u265C',
  b: '\u265D',
  n: '\u265E',
  p: '\u265F',
}

const PIECE_NAME_AR: Record<PieceType, string> = {
  k: 'ملك',
  q: 'ملكة',
  r: 'قلعة',
  b: 'فيل',
  n: 'حصان',
  p: 'بيدق',
}

export function pieceNameAr(t: PieceType): string {
  return PIECE_NAME_AR[t]
}

interface PieceProps {
  type: PieceType
  color: 'w' | 'b'
  className?: string
  size?: string | number
}

export function Piece({ type, color, className, size = '100%' }: PieceProps): JSX.Element {
  const isWhite = color === 'w'
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`${PIECE_NAME_AR[type]} ${isWhite ? 'أبيض' : 'أسود'}`}
      style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.45))' }}
    >
      <text
        x="50"
        y="55"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="78"
        fontWeight="700"
        fontFamily='"Noto Sans Symbols 2","Segoe UI Symbol","Apple Symbols","DejaVu Sans",sans-serif'
        fill={isWhite ? '#FAF3E3' : '#262019'}
        stroke={isWhite ? '#3B2A1A' : '#D9C08F'}
        strokeWidth={isWhite ? 2.6 : 1.8}
        paintOrder="stroke"
        strokeLinejoin="round"
      >
        {GLYPH[type]}
      </text>
    </svg>
  )
}

// صف قطع مأكولة صغير (لعرضه في بطاقة اللاعب)
export function CapturedRow({ pieces, color, diff }: { pieces: string[]; color: 'w' | 'b'; diff?: number }) {
  if (pieces.length === 0 && !diff) return <div className="h-4" />
  const order: Record<string, number> = { q: 0, r: 1, b: 2, n: 3, p: 4 }
  const sorted = [...pieces].sort((a, b) => order[a] - order[b])
  return (
    <div className="flex items-center gap-[1px] flex-wrap min-h-4" dir="ltr">
      {sorted.map((p, i) => (
        <svg key={i} viewBox="0 0 100 100" className="w-3.5 h-3.5 -mx-[1px] opacity-90">
          <text
            x="50"
            y="56"
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize="86"
            fontFamily='"Noto Sans Symbols 2","Segoe UI Symbol","Apple Symbols","DejaVu Sans",sans-serif'
            fill={color === 'w' ? '#FAF3E3' : '#3A3128'}
            stroke={color === 'w' ? '#3B2A1A' : '#C9AE7C'}
            strokeWidth="10"
            paintOrder="stroke"
          >
            {GLYPH[p as PieceType]}
          </text>
        </svg>
      ))}
      {!!diff && diff > 0 && <span className="text-[10px] font-bold text-amber-300/90 mr-1">+{diff}</span>}
    </div>
  )
}
