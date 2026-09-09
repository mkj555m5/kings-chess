'use client'

// رقعة الشطرنج - شبكة 8x8 مع تحديد النقلات القانونية والسحب والإفلات
import { useState, type JSX } from 'react'
import { Piece } from './pieces'
import { FILES, RANKS } from '@/lib/game-utils'

interface BoardPieceInfo {
  square: string
  type: 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
  color: 'w' | 'b'
}

export type BoardCell = BoardPieceInfo | null

export interface BoardProps {
  board: (BoardPieceInfo | null)[][]
  orientation: 'white' | 'black'
  selected: string | null
  legalTargets: Map<string, boolean> // square -> isCapture
  lastMove: { from: string; to: string } | null
  checkSquare: string | null
  interactive: boolean
  movableColor: 'w' | 'b' | 'both' // اللون الذي يمكن تحريك قطعه
  onSquareClick: (square: string) => void
  onDropMove: (from: string, to: string) => void
  showCoordinates?: boolean
}

const LIGHT_SQUARE = '#E8D3A8'
const DARK_SQUARE = '#9E6B3E'

export function Board({
  board,
  orientation,
  selected,
  legalTargets,
  lastMove,
  checkSquare,
  interactive,
  movableColor,
  onSquareClick,
  onDropMove,
  showCoordinates = true,
}: BoardProps) {
  const [dragFrom, setDragFrom] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  const rows = orientation === 'white' ? board : [...board].reverse().map((r) => [...r].reverse())

  const squareColor = (square: string) => {
    const x = FILES.indexOf(square[0])
    const y = RANKS.indexOf(square[1])
    return (x + y) % 2 === 0 ? 'light' : 'dark'
  }

  return (
    <div
      dir="ltr"
      className="relative rounded-2xl p-[10px] select-none"
      style={{
        background: 'linear-gradient(135deg,#D4A64B 0%,#8C5E24 30%,#C89B3C 55%,#7A4E1D 100%)',
        boxShadow: '0 0 0 1px rgba(255,220,150,.35), 0 18px 50px -12px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,235,180,.35)',
      }}
    >
      <div className="grid grid-cols-8 grid-rows-8 overflow-hidden rounded-lg" style={{ aspectRatio: '1 / 1' }}>
        {rows.map((row, ri) =>
          row.map((piece, ci) => {
            const square = orientation === 'white' ? `${FILES[ci]}${RANKS[ri]}` : `${FILES[7 - ci]}${RANKS[7 - ri]}`
            const color = squareColor(square)
            const isSelected = selected === square
            const isLegal = legalTargets.has(square)
            const isCapture = isLegal && legalTargets.get(square)
            const isLast = lastMove && (lastMove.from === square || lastMove.to === square)
            const isCheck = checkSquare === square
            const canGrab =
              interactive && piece && (movableColor === 'both' || piece.color === movableColor)

            return (
              <div
                key={square}
                role="button"
                aria-label={`مربع ${square}${piece ? ` - ${piece.color === 'w' ? 'أبيض' : 'أسود'}` : ''}`}
                tabIndex={-1}
                onClick={() => onSquareClick(square)}
                onDragOver={(e) => {
                  if (dragFrom) {
                    e.preventDefault()
                    setDragOver(square)
                  }
                }}
                onDragLeave={() => setDragOver((d) => (d === square ? null : d))}
                onDrop={(e) => {
                  e.preventDefault()
                  if (dragFrom && dragFrom !== square) onDropMove(dragFrom, square)
                  setDragFrom(null)
                  setDragOver(null)
                }}
                className="relative flex items-center justify-center"
                style={{ backgroundColor: color === 'light' ? LIGHT_SQUARE : DARK_SQUARE, cursor: canGrab ? 'grab' : isLegal ? 'pointer' : 'default' }}
              >
                {/* آخر نقلة */}
                {isLast && <div className="absolute inset-0" style={{ background: 'rgba(250, 204, 21, 0.34)' }} />}
                {/* المربع المحدد */}
                {isSelected && (
                  <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 0 4px rgba(251,191,36,.95)', background: 'rgba(251,191,36,.18)' }} />
                )}
                {/* هدف سحب */}
                {dragOver === square && <div className="absolute inset-0 ring-4 ring-inset ring-amber-200/80" />}
                {/* كش الملك */}
                {isCheck && (
                  <div
                    className="absolute inset-0 animate-pulse"
                    style={{ background: 'radial-gradient(circle, rgba(239,68,68,.75) 15%, rgba(239,68,68,.25) 60%, transparent 75%)' }}
                  />
                )}

                {/* القطعة */}
                {piece && (
                  <div
                    draggable={!!canGrab}
                    onDragStart={(e) => {
                      if (!canGrab) {
                        e.preventDefault()
                        return
                      }
                      setDragFrom(square)
                      onSquareClick(square)
                      // يلزم تأخير إزالة الصورة الافتراضية
                      const img = new Image()
                      img.src = ''
                      e.dataTransfer.setData('text/plain', square)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => setDragFrom(null)}
                    className={`relative z-10 w-[86%] h-[86%] ${canGrab ? 'cursor-grab active:cursor-grabbing' : ''} ${dragFrom === square ? 'opacity-40' : ''} transition-transform hover:scale-[1.04]`}
                  >
                    <Piece type={piece.type} color={piece.color} />
                  </div>
                )}

                {/* نقاط النقلات القانونية */}
                {isLegal && !piece && (
                  <div className="absolute z-20 rounded-full" style={{ width: '30%', height: '30%', background: 'rgba(20,12,4,.32)' }} />
                )}
                {isLegal && isCapture && (
                  <div className="absolute inset-0 z-20 rounded-full" style={{ boxShadow: 'inset 0 0 0 5px rgba(20,12,4,.35)' }} />
                )}

                {/* إحداثيات الحواف */}
                {showCoordinates && (
                  <>
                    {orientation === 'white' ? ci === 0 : ci === 7 ? null : null}
                    {((orientation === 'white' && ci === 0) || (orientation === 'black' && ci === 7)) && (
                      <span
                        className="absolute left-[3px] top-[2px] text-[9px] sm:text-[10px] font-bold pointer-events-none"
                        style={{ color: color === 'light' ? DARK_SQUARE : LIGHT_SQUARE }}
                      >
                        {square[1]}
                      </span>
                    )}
                    {((orientation === 'white' && ri === 7) || (orientation === 'black' && ri === 0)) && (
                      <span
                        className="absolute right-[3px] bottom-[1px] text-[9px] sm:text-[10px] font-bold pointer-events-none"
                        style={{ color: color === 'light' ? DARK_SQUARE : LIGHT_SQUARE }}
                      >
                        {square[0]}
                      </span>
                    )}
                  </>
                )}
              </div>
            )
          }),
        )}
      </div>
    </div>
  )
}
