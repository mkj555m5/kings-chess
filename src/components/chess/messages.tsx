'use client'

// لوحة تعليقات الوزير (AI) والدردشة (أونلاين)
// التمرير ذكي وغير مزعج: يتحرك داخل صندوق المحادثة فقط (لا يسحب الصفحة كلها)،
// ويتوقف تلقائياً إذا صعد المستخدم لقراءة رسائل سابقة
import { useEffect, useRef, useState, type JSX } from 'react'
import { Piece } from './pieces'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** خطاف تمرير داخلي مهذب: يمرر صندوق الرسائل فقط ولا يمس تمرير الصفحة إطلاقاً، ويتوقف إذا صعد المستخدم للقراءة */
function usePoliteScroll(deps: unknown[]) {
  const boxRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true) // هل المستخدم في أسفل الصندوق؟

  useEffect(() => {
    const el = boxRef.current
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight
  }, deps)

  const onScroll = () => {
    const el = boxRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = distance < 60
  }

  return { boxRef, onScroll }
}

export interface AIMessage {
  id: string
  text: string
  at: number
}

export function AIPanel({
  messages,
  thinking,
  difficultyLabel,
  modelLabel,
}: {
  messages: AIMessage[]
  thinking: boolean
  difficultyLabel: string
  modelLabel: string
}) {
  const { boxRef, onScroll } = usePoliteScroll([messages.length, thinking])

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-amber-900/40 bg-stone-900/70">
      <div className="flex items-center gap-2 border-b border-amber-900/40 px-3 py-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-amber-700/50 bg-stone-800">
          <Piece type="q" color="b" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-bold text-amber-300">الوزير</div>
          <div className="text-[10px] text-stone-500">
            {difficultyLabel} · {modelLabel}
          </div>
        </div>
        {thinking && (
          <div className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400 [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400 [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-amber-400 [animation-delay:300ms]" />
            <span className="text-[10px] font-semibold text-amber-300">يفكر…</span>
          </div>
        )}
      </div>
      <div ref={boxRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 chess-scroll">
        {messages.length === 0 && !thinking && (
          <div className="pt-6 text-center text-xs text-stone-600">
            تعليقات الوزير تظهر هنا أثناء المباراة…
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex gap-2">
            <div className="mt-0.5 h-6 w-6 shrink-0 rounded-md border border-amber-800/50 bg-stone-800 p-0.5">
              <Piece type="q" color="b" />
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-amber-900/40 bg-stone-800/80 px-3 py-2 text-sm leading-relaxed text-amber-50/95 shadow-sm">
              {m.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export interface ChatMessage {
  id: string
  from: 'white' | 'black' | 'system'
  name: string
  text: string
  at: number
}

export function ChatPanel({
  messages,
  onSend,
  myName,
  className,
}: {
  messages: ChatMessage[]
  onSend: (text: string) => void
  myName: string
  className?: string
}) {
  const [text, setText] = useState('')
  const { boxRef, onScroll } = usePoliteScroll([messages.length])

  const send = () => {
    const t = text.trim()
    if (!t) return
    onSend(t)
    setText('')
  }

  return (
    <div className={cn('flex min-h-0 flex-col rounded-xl border border-stone-800 bg-stone-900/70', className)}>
      <div className="border-b border-stone-800 px-3 py-2 text-xs font-bold text-stone-400">دردشة المباراة</div>
      <div ref={boxRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5 chess-scroll">
        {messages.length === 0 && <div className="pt-4 text-center text-xs text-stone-600">قل مرحباً لخصمك!</div>}
        {messages.map((m) =>
          m.from === 'system' ? (
            <div key={m.id} className="text-center text-[11px] italic text-stone-500">{m.text}</div>
          ) : (
            <div key={m.id} className={cn('flex flex-col', m.name === myName ? 'items-start' : 'items-start')}>
              <span className={cn('text-[10px] font-bold', m.name === myName ? 'text-emerald-400' : 'text-amber-400')}>{m.name}</span>
              <div className="max-w-[90%] rounded-lg bg-stone-800/80 px-2.5 py-1.5 text-sm text-stone-100">{m.text}</div>
            </div>
          ),
        )}
      </div>
      <div className="flex gap-1.5 border-t border-stone-800 p-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="اكتب رسالة…"
          className="h-8 bg-stone-800/60 border-stone-700 text-sm"
          maxLength={300}
        />
        <Button size="sm" onClick={send} className="h-8 px-3 bg-amber-600 hover:bg-amber-500 text-stone-950 font-bold">
          إرسال
        </Button>
      </div>
    </div>
  )
}
