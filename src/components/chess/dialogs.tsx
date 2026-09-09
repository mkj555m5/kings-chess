'use client'

// حواري الترقية ونهاية المباراة
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Piece, pieceNameAr } from './pieces'
import { reasonToAr, colorNameAr } from '@/lib/game-utils'

export function PromotionDialog({
  open,
  color,
  onChoose,
  onCancel,
}: {
  open: boolean
  color: 'w' | 'b'
  onChoose: (piece: 'q' | 'r' | 'b' | 'n') => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-amber-300">ترقية البيدق</DialogTitle>
          <DialogDescription>اختر القطعة التي سيتحول إليها بيدقك</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-2 py-2">
          {(['q', 'r', 'b', 'n'] as const).map((p) => (
            <button
              key={p}
              onClick={() => onChoose(p)}
              className="group flex flex-col items-center gap-1 rounded-xl border border-amber-800/40 bg-stone-900/60 p-3 transition-all hover:border-amber-400 hover:bg-stone-800 hover:shadow-[0_0_18px_rgba(251,191,36,.25)]"
            >
              <div className="h-12 w-12">
                <Piece type={p} color={color} />
              </div>
              <span className="text-xs text-stone-300 group-hover:text-amber-200">{pieceNameAr(p)}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function GameOverDialog({
  open,
  result, // 'win' | 'loss' | 'draw' من وجهة نظر المشاهد
  reason,
  winnerName,
  aiComment,
  onRematch,
  onExit,
  canRematch,
}: {
  open: boolean
  result: 'win' | 'loss' | 'draw'
  reason: string | null
  winnerName?: string | null
  aiComment?: string | null
  onRematch?: () => void
  onExit: () => void
  canRematch: boolean
}) {
  const title = result === 'win' ? '🎉 انتصار!' : result === 'loss' ? 'هزيمة' : 'تعادل'
  const subtitle =
    result === 'draw'
      ? 'انتهت المباراة بالتعادل'
      : winnerName
        ? `الفائز: ${winnerName}`
        : result === 'win'
          ? 'لقد فزت بالمباراة'
          : 'خسرت المباراة'

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle
            className={`text-center text-3xl font-extrabold ${
              result === 'win' ? 'text-emerald-400' : result === 'loss' ? 'text-red-400' : 'text-amber-300'
            }`}
          >
            {title}
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            {subtitle}
            {reason && <span className="block text-sm text-stone-400 mt-1">السبب: {reasonToAr(reason)}</span>}
          </DialogDescription>
        </DialogHeader>
        {aiComment && (
          <div className="rounded-xl border border-amber-800/40 bg-stone-900/70 p-3 text-sm text-amber-100/90">
            <span className="font-bold text-amber-300">الوزير: </span>
            {aiComment}
          </div>
        )}
        <div className="flex gap-2 justify-center pt-2">
          {canRematch && onRematch && (
            <Button
              onClick={onRematch}
              className="bg-gradient-to-l from-amber-600 to-amber-500 text-stone-950 font-bold hover:from-amber-500 hover:to-amber-400"
            >
              مباراة الثأر
            </Button>
          )}
          <Button variant="outline" onClick={onExit} className="border-stone-700 text-stone-200 hover:bg-stone-800">
            القائمة الرئيسية
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// حوار عروض التعادل (أونلاين)
export function DrawOfferDialog({
  open,
  fromName,
  onAccept,
  onDecline,
}: {
  open: boolean
  fromName: string
  onAccept: () => void
  onDecline: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-amber-300">عرض تعادل</DialogTitle>
          <DialogDescription>{fromName} يععرض عليك تعادلاً. ماذا تقرر؟</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 justify-center pt-1">
          <Button onClick={onAccept} className="bg-emerald-600 hover:bg-emerald-500 font-bold">
            قبول التعادل
          </Button>
          <Button variant="outline" onClick={onDecline} className="border-stone-700 text-stone-200 hover:bg-stone-800">
            رفض ومواصلة اللعب
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function colorLabel(c: 'w' | 'b' | 'white' | 'black'): string {
  return colorNameAr(c)
}
