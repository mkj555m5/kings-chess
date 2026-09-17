'use client'

// قطع الشطرنج - مجموعة Cburnett الاحترافية (SVG حقيقي، نفس مجموعة lichess)
// المصدر: lichess-org/lila (public/piece/cburnett) — رخصة CC BY-SA 3.0 للمؤلف Colin M.L. Burnett
// الأصول في public/pieces/ (wK.svg … bP.svg)
// في حال فشل تحميل الصورة يرتد تلقائياً لرمز يونيكود مرسوم داخل SVG (نفس المظهر القديم)
import { useEffect, useState, type JSX } from 'react'
import { cn } from '@/lib/utils'

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
  flat?: boolean // بدون ظل (لصف القطع المأكولة المصغرة)
}

export function Piece({ type, color, className, size = '100%', flat = false }: PieceProps): JSX.Element {
  const isWhite = color === 'w'
  const [failed, setFailed] = useState(false)
  const label = `${PIECE_NAME_AR[type]} ${isWhite ? 'أبيض' : 'أسود'}`
  const filter = flat ? undefined : ({ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.45))' } as const)

  if (failed) {
    return (
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className={className}
        role="img"
        aria-label={label}
        style={filter}
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

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/pieces/${color}${type.toUpperCase()}.svg`}
      alt={label}
      title={label}
      draggable={false}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn('select-none object-contain', className)}
      style={filter}
    />
  )
}

// صورة الملف الشخصي من تلجرام مع ارتداد تلقائي لأيقونة قطعة عند الغياب/الفشل
export function TelegramAvatar({
  telegramId,
  color = 'w',
  pieceType = 'k',
  className,
}: {
  telegramId?: string | null
  color?: 'w' | 'b'
  pieceType?: PieceType
  className?: string
}): JSX.Element {
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>(telegramId ? 'loading' : 'fail')

  useEffect(() => {
    setState(telegramId ? 'loading' : 'fail')
  }, [telegramId])

  return (
    <span className={cn('relative block h-full w-full', className)}>
      <span className="absolute inset-0 flex items-center justify-center">
        <Piece type={pieceType} color={color} />
      </span>
      {telegramId && state !== 'fail' && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/telegram/avatar?user=${telegramId}`}
          alt="صورة اللاعب من تلجرام"
          draggable={false}
          onLoad={() => setState('ok')}
          onError={() => setState('fail')}
          className={cn(
            'absolute inset-0 h-full w-full rounded-lg object-cover transition-opacity duration-300',
            state === 'ok' ? 'opacity-100' : 'opacity-0',
          )}
        />
      )}
    </span>
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
        <span key={i} className="w-3.5 h-3.5 -mx-[1px] opacity-90 inline-block overflow-hidden">
          <Piece type={p as PieceType} color={color} size="100%" flat />
        </span>
      ))}
      {!!diff && diff > 0 && <span className="text-[10px] font-bold text-amber-300/90 mr-1">+{diff}</span>}
    </div>
  )
}
