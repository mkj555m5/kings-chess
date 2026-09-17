'use client'

// الهيكل العام لشاشة اللعب - مكون عرضي يجمع البطاقات والرقعة واللوحات الجانبية
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Board, type BoardCell } from './board'
import { EvalBar, PlayerCard } from './panels'
import { AIPanel, ChatPanel, type AIMessage, type ChatMessage } from './messages'

export interface ActionButtonDesc {
  label: string
  onClick: () => void
  variant?: 'default' | 'outline' | 'destructive' | 'ghost'
  disabled?: boolean
}

export interface PlayerCardData {
  name: string
  color: 'w' | 'b'
  isTurn: boolean
  capturedPieces: string[]
  clockMs: number | null
  clockActive: boolean
  isAI?: boolean
  connected?: boolean
  thinkBadge?: string | null
}

export function GameShell({
  mode,
  topCard,
  bottomCard,
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
  showEval,
  evalCp,
  statusText,
  statusSub,
  aiMessages,
  aiThinking,
  aiDifficultyLabel,
  aiModelLabel,
  chat,
  actions,
  footerNote,
  children,
}: {
  mode: 'ai' | 'online' | 'local'
  topCard: PlayerCardData
  bottomCard: PlayerCardData
  board: BoardCell[][]
  orientation: 'white' | 'black'
  selected: string | null
  legalTargets: Map<string, boolean>
  lastMove: { from: string; to: string } | null
  checkSquare: string | null
  interactive: boolean
  movableColor: 'w' | 'b' | 'both'
  onSquareClick: (sq: string) => void
  onDropMove: (from: string, to: string) => void
  showEval: boolean
  evalCp: number | null
  statusText: string
  statusSub?: string
  aiMessages: AIMessage[]
  aiThinking: boolean
  aiDifficultyLabel: string
  aiModelLabel: string
  chat?: { messages: ChatMessage[]; onSend: (t: string) => void; myName: string; myColor?: 'white' | 'black' }
  actions: ActionButtonDesc[]
  footerNote?: ReactNode
  children?: ReactNode
}) {
  // العمود الجانبي يظهر فقط في وضع الوزير أو الأونلاين (عند وجود محادثة)
  const hasSidebar = mode === 'ai' || (mode === 'online' && !!chat)
  return (
    <div className="mx-auto w-full max-w-6xl px-3 pb-6 pt-4" dir="rtl">
      <div className={cnGrid(hasSidebar)}>
        {/* العمود الرئيسي: الرقعة والبطاقات */}
        <div className="flex flex-col gap-3">
          <PlayerCard {...topCard} />

          <div className="flex items-stretch justify-center gap-2">
            {showEval && <EvalBar evalCp={evalCp} orientation={orientation} />}
            <div className="w-full max-w-[min(78vh,640px)]">
              <Board
                board={board}
                orientation={orientation}
                selected={selected}
                legalTargets={legalTargets}
                lastMove={lastMove}
                checkSquare={checkSquare}
                interactive={interactive}
                movableColor={movableColor}
                onSquareClick={onSquareClick}
                onDropMove={onDropMove}
              />
            </div>
          </div>

          <PlayerCard {...bottomCard} />

          <div className="flex flex-wrap items-center justify-center gap-2">
            {actions.map((a) => (
              <Button
                key={a.label}
                size="sm"
                variant={a.variant ?? 'outline'}
                onClick={a.onClick}
                disabled={a.disabled}
                className={
                  a.variant === 'destructive'
                    ? 'bg-red-950/60 border-red-900/60 text-red-300 hover:bg-red-900/50 hover:text-red-200'
                    : a.variant === 'outline'
                      ? 'border-stone-700 bg-stone-900/60 text-stone-200 hover:bg-stone-800 hover:text-amber-200'
                      : ''
                }
              >
                {a.label}
              </Button>
            ))}
          </div>
          <div className="text-center">
            <div className="text-sm font-bold text-stone-200">{statusText}</div>
            {statusSub && <div className="text-xs text-stone-500">{statusSub}</div>}
            {footerNote && <div className="mt-1 text-[11px] text-stone-600">{footerNote}</div>}
          </div>
        </div>

        {/* العمود الجانبي (يظهر فقط عند وجود محادثة أو تعليقات الوزير) */}
        {hasSidebar && (
          <div className="flex min-h-[420px] flex-col gap-3 lg:h-[calc(100vh-140px)] lg:min-h-0">
            {mode === 'ai' ? (
              <AIPanel messages={aiMessages} thinking={aiThinking} difficultyLabel={aiDifficultyLabel} modelLabel={aiModelLabel} />
            ) : mode === 'online' && chat ? (
              <ChatPanel messages={chat.messages} onSend={chat.onSend} myName={chat.myName} myColor={chat.myColor} className="flex-1" />
            ) : null}
          </div>
        )}
      </div>
      {children}
    </div>
  )
}

const cnGrid = (hasSidebar: boolean) =>
  hasSidebar ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]' : 'grid gap-4 lg:grid-cols-[minmax(0,1fr)]'
