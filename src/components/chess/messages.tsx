'use client'

// لوحة تعليقات الوزير (AI) والدردشة (أونلاين)
// التمرير ذكي وغير مزعج: يتحرك داخل صندوق المحادثة فقط (لا يسحب الصفحة كلها)،
// ويتوقف تلقائياً إذا صعد المستخدم لقراءة رسائل سابقة
import { useCallback, useEffect, useRef, useState } from 'react'
import { Piece } from './pieces'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** خطاف تمرير داخلي مهذب — النسخة الخام: لا يعرف شيئاً عن الرسائل */
function usePoliteScrollRaw(deps: unknown[]) {
  const boxRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const [pinned, setPinned] = useState(true)

  const scrollToEndBase = useCallback(() => {
    const el = boxRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
      pinnedRef.current = true
      setPinned(true)
    }
  }, [])

  useEffect(() => {
    if (pinnedRef.current) {
      const el = boxRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, deps)

  const onScrollBase = useCallback(() => {
    const el = boxRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = distance < 60
    setPinned(pinnedRef.current)
  }, [])

  return { boxRef, onScrollBase, pinned, scrollToEndBase, pinnedRef }
}

/** خطاف تمرير داخلي مهذب: يمرر صندوق الرسائل فقط ولا يمس تمرير الصفحة إطلاقاً، ويتوقف إذا صعد المستخدم للقراءة */
function usePoliteScroll(deps: unknown[]) {
  const boxRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true) // هل المستخدم في أسفل الصندوق؟
  const [pinned, setPinned] = useState(true)

  const scrollToEnd = useCallback(() => {
    const el = boxRef.current
    if (el) {
      el.scrollTop = el.scrollHeight
      pinnedRef.current = true
      setPinned(true)
    }
  }, [])

  useEffect(() => {
    if (pinnedRef.current) {
      const el = boxRef.current
      if (el) el.scrollTop = el.scrollHeight
    }
  }, deps)

  const onScroll = () => {
    const el = boxRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    pinnedRef.current = distance < 60
    setPinned(pinnedRef.current)
  }

  return { boxRef, onScroll, pinned, scrollToEnd }
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
          <div key={m.id} className="flex animate-in fade-in slide-in-from-bottom-1 gap-2 duration-300">
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

const QUICK_REACTIONS = ['👋', '👍', '👏', '😂', '😮', '🔥', '😱', '♟️'] as const

function formatTime(at: number) {
  try {
    return new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(at))
  } catch {
    return ''
  }
}

export function ChatPanel({
  messages,
  onSend,
  myName,
  myColor,
  className,
}: {
  messages: ChatMessage[]
  onSend: (text: string) => void
  myName: string
  myColor?: 'white' | 'black'
  className?: string
}) {
  const [text, setText] = useState('')
  const [maxSeen, setMaxSeen] = useState(0) // آخر عدد رسائل شاهدها المستخدم
  const lenRef = useRef(0)
  const { boxRef, onScrollBase, pinned, scrollToEndBase, pinnedRef } = usePoliteScrollRaw([messages.length])

  // مرآة طول القائمة للقراءة داخل معالجات الأحداث (بدون setState داخل effect)
  useEffect(() => {
    lenRef.current = messages.length
  }, [messages.length])

  const markSeen = () => setMaxSeen(lenRef.current)

  const onScroll = () => {
    onScrollBase()
    if (pinnedRef.current) markSeen()
  }

  const scrollToEnd = () => {
    scrollToEndBase()
    markSeen()
  }

  const unread = pinned ? 0 : Math.max(0, messages.length - maxSeen)

  const send = (value?: string) => {
    const v = (value ?? text).trim()
    if (!v) return
    onSend(v.slice(0, 300))
    if (value === undefined) setText('')
  }

  return (
    <div className={cn('relative flex min-h-0 flex-col rounded-xl border border-stone-800 bg-stone-900/70', className)}>
      <div className="flex items-center justify-between border-b border-stone-800 px-3 py-2">
        <span className="text-xs font-bold text-stone-400">دردشة المباراة</span>
        <span className="flex items-center gap-1.5 text-[10px] text-stone-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          متصل
        </span>
      </div>

      <div ref={boxRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5 chess-scroll">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-1.5 pt-6 text-center">
            <div className="text-2xl opacity-40">💬</div>
            <div className="text-xs text-stone-600">قل مرحباً لخصمك!</div>
            <div className="text-[10px] text-stone-700">اضغط على التفاعلات السريعة بالأسفل</div>
          </div>
        )}
        {messages.map((m) => {
          if (m.from === 'system') {
            return (
              <div key={m.id} className="flex justify-center">
                <span className="rounded-full border border-stone-800 bg-stone-800/50 px-3 py-1 text-center text-[11px] italic text-stone-400">
                  {m.text}
                </span>
              </div>
            )
          }
          const isMine = myColor ? m.from === myColor : m.name === myName
          const isSystemName = m.name === 'النظام'
          return (
            <div key={m.id} className={cn('flex animate-in fade-in slide-in-from-bottom-1 items-end gap-1.5 duration-300', isMine ? 'flex-row-reverse' : 'flex-row')}>
              {/* الصورة الرمزية */}
              <div
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border p-0.5',
                  m.from === 'white' ? 'border-stone-400/40 bg-stone-300' : 'border-stone-700 bg-stone-900',
                )}
                title={m.name}
              >
                <Piece type="p" color={m.from === 'white' ? 'w' : 'b'} />
              </div>
              {/* الفقاعة (في RTL: محاذاة يسار = رسائلي، يسار = رسائل الخصم المرآة) */}
              <div className={cn('flex max-w-[80%] flex-col', isMine ? 'items-end' : 'items-start')}>
                <span className={cn('mb-0.5 text-[10px] font-bold', isMine ? 'text-emerald-400' : 'text-amber-400')}>
                  {isSystemName ? 'النظام' : m.name}
                  {isMine && <span className="font-normal text-stone-600"> (أنت)</span>}
                </span>
                <div
                  className={cn(
                    'rounded-2xl px-3 py-1.5 text-sm leading-relaxed shadow-sm',
                    isMine
                      ? 'rounded-bl-sm border border-emerald-800/50 bg-gradient-to-b from-emerald-900/50 to-emerald-950/60 text-emerald-50'
                      : 'rounded-br-sm border border-stone-700/70 bg-stone-800/90 text-stone-100',
                  )}
                >
                  {m.text}
                </div>
                <span className="mt-0.5 text-[9px] text-stone-600" dir="ltr">
                  {formatTime(m.at)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* زر الرسائل الجديدة: يظهر فقط إذا صعد المستخدم للقراءة */}
      {!pinned && unread > 0 && (
        <button
          onClick={scrollToEnd}
          className="absolute bottom-24 right-1/2 z-10 translate-x-1/2 animate-in fade-in slide-in-from-bottom-2 rounded-full border border-amber-600/60 bg-stone-900 px-4 py-1.5 text-xs font-bold text-amber-300 shadow-lg transition-transform hover:scale-105"
        >
          {unread} رسالة جديدة ↓
        </button>
      )}

      {/* تفاعلات سريعة */}
      <div className="flex items-center gap-1 border-t border-stone-800 px-2 pt-1.5">
        {QUICK_REACTIONS.map((r) => (
          <button
            key={r}
            onClick={() => send(r)}
            className="rounded-md px-1.5 py-0.5 text-sm opacity-60 transition-all hover:scale-125 hover:bg-stone-800 hover:opacity-100"
            title={`إرسال ${r}`}
          >
            {r}
          </button>
        ))}
        <span className="mr-auto text-[9px] text-stone-700">تفاعلات سريعة</span>
      </div>

      <div className="flex gap-1.5 border-t border-stone-800 p-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="اكتب رسالة…"
          className="h-8 border-stone-700 bg-stone-800/60 text-sm"
          maxLength={300}
        />
        <Button size="sm" onClick={() => send()} className="h-8 bg-amber-600 px-3 font-bold text-stone-950 hover:bg-amber-500">
          إرسال
        </Button>
      </div>
    </div>
  )
}
