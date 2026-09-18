'use client'

// ============ الأصدقاء والمراسلة ============
// إضافة أصدقاء بالمعرف/الاسم، قبول الطلبات، ودردشة كاملة:
// نص + صور (مضغوطة تلقائياً) + فيديو قصير + ملصقات جاهزة

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Avatar } from './avatar'

interface FriendUser {
  telegramId: string
  displayName: string
  username: string | null
  points?: number
}

interface Threads {
  friends: FriendUser[]
  incoming: (FriendUser & { requestId: string })[]
  outgoing: (FriendUser & { requestId: string })[]
}

interface Msg {
  id: string
  fromTgId: string
  toTgId: string
  kind: 'text' | 'image' | 'video' | 'sticker'
  body: string
  createdAt: string
}

const STICKERS = ['🎉', '😂', '😱', '🔥', '👑', '⚽', '♟️', '🏆', '💪', '🤝', '🎯', '💥', '🥅', '⭐', '🃏', '😤', '👏', '🤖']

interface Props {
  tgId: string
  name: string
}

export function FriendsPanel({ tgId, name }: Props) {
  const [threads, setThreads] = useState<Threads>({ friends: [], incoming: [], outgoing: [] })
  const [active, setActive] = useState<FriendUser | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [addValue, setAddValue] = useState('')
  const [addMsg, setAddMsg] = useState('')
  const [showStickers, setShowStickers] = useState(false)
  const [uploading, setUploading] = useState(false)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch(`/api/kingdom/friends?tgId=${tgId}`)
      const data = await res.json()
      if (data.ok) setThreads({ friends: data.friends, incoming: data.incoming, outgoing: data.outgoing })
    } catch {
      // تجاهل
    }
  }, [tgId])

  useEffect(() => {
    void loadThreads()
    const t = setInterval(() => void loadThreads(), 8000)
    return () => clearInterval(t)
  }, [loadThreads])

  // جلب رسائل المحادثة النشطة (polling)
  useEffect(() => {
    if (!active) return
    let lastTs = 0
    const load = async () => {
      try {
        const url = `/api/kingdom/messages?tgId=${tgId}&peer=${active.telegramId}${lastTs ? `&after=${lastTs}` : ''}`
        const res = await fetch(url)
        const data = await res.json()
        if (data.ok && data.messages?.length) {
          setMsgs((prev) => {
            const merged = lastTs ? [...prev, ...(data.messages as Msg[])] : (data.messages as Msg[])
            return merged.filter((m, i, arr) => arr.findIndex((x) => x.id === m.id) === i)
          })
          const last = (data.messages as Msg[])[data.messages.length - 1]
          if (last) lastTs = new Date(last.createdAt).getTime()
          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
        }
      } catch {
        // تجاهل
      }
    }
    void load()
    const t = setInterval(() => void load(), 2500)
    return () => clearInterval(t)
  }, [active, tgId])

  const send = async (kind: Msg['kind'], body: string) => {
    if (!active || !body) return
    try {
      const res = await fetch('/api/kingdom/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tgId, toTgId: active.telegramId, kind, body }),
      })
      const data = await res.json()
      if (data.ok) {
        setMsgs((prev) => [...prev, data.message as Msg])
        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)
      }
    } catch {
      // تجاهل
    }
  }

  // ضغط الصور قبل الإرسال (حتى ~1600px و 350KB)
  const sendImage = async (file: File) => {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const img = await createImageBitmap(file)
      const scale = Math.min(1, 1400 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      let q = 0.82
      let dataUrl = canvas.toDataURL('image/jpeg', q)
      while (dataUrl.length > 480_000 && q > 0.4) {
        q -= 0.12
        dataUrl = canvas.toDataURL('image/jpeg', q)
      }
      await send('image', dataUrl)
    } catch {
      // تجاهل
    }
    setUploading(false)
  }

  const sendVideo = async (file: File) => {
    if (!file.type.startsWith('video/')) return
    if (file.size > 1_800_000) {
      setAddMsg('🎬 الفيديو كبير — الحد ١.٨ ميجابايت')
      setTimeout(() => setAddMsg(''), 3000)
      return
    }
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      await send('video', String(reader.result))
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  const friendAction = async (action: string, extra: Record<string, unknown> = {}) => {
    try {
      const res = await fetch('/api/kingdom/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, tgId, ...extra }),
      })
      const data = await res.json()
      if (data.message) setAddMsg(data.message)
      if (data.error) setAddMsg('⚠️ ' + data.error)
      setTimeout(() => setAddMsg(''), 3500)
      void loadThreads()
    } catch {
      // تجاهل
    }
  }

  // ===== واجهة المحادثة =====
  if (active) {
    return (
      <div className="flex h-[70vh] flex-col rounded-3xl border border-white/10 bg-white/5">
        {/* رأس المحادثة */}
        <div className="flex items-center gap-2 border-b border-white/10 p-3">
          <button onClick={() => setActive(null)} className="rounded-xl bg-white/10 px-2.5 py-1.5 text-sm font-bold">
            ←
          </button>
          <Avatar telegramId={active.telegramId} name={active.displayName} size={38} />
          <div className="flex-1">
            <div className="text-sm font-bold">{active.displayName}</div>
            <div className="text-[10px] text-zinc-500">{active.username ? `@${active.username}` : `ID: ${active.telegramId}`}</div>
          </div>
          <button
            onClick={() => friendAction('remove', { target: active.telegramId })}
            className="rounded-lg bg-rose-500/20 px-2 py-1 text-[10px] font-bold text-rose-300"
          >
            إزالة
          </button>
        </div>

        {/* الرسائل */}
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {msgs.map((m) => {
            const mine = m.fromTgId === tgId
            return (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex ${mine ? 'justify-start' : 'justify-end'}`}>
                <div className={`max-w-[75%] rounded-2xl p-2.5 text-sm ${mine ? 'bg-emerald-500/20 text-emerald-50' : 'bg-zinc-700/60 text-zinc-100'}`}>
                  {m.kind === 'text' && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                  {m.kind === 'image' && (
                     
                    <img src={m.body} alt="صورة" className="max-h-56 rounded-xl" />
                  )}
                  {m.kind === 'video' && <video src={m.body} controls className="max-h-56 rounded-xl" />}
                  {m.kind === 'sticker' && <div className="text-5xl">{m.body}</div>}
                  <div className={`mt-0.5 text-[9px] ${mine ? 'text-emerald-300/70' : 'text-zinc-500'}`}>
                    {new Date(m.createdAt).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </motion.div>
            )
          })}
          <div ref={chatEndRef} />
        </div>

        {/* الملصقات */}
        <AnimatePresence>
          {showStickers && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="grid grid-cols-6 gap-1 overflow-hidden border-t border-white/10 p-2">
              {STICKERS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    void send('sticker', s)
                    setShowStickers(false)
                  }}
                  className="rounded-xl bg-white/5 py-2 text-3xl transition hover:scale-110 hover:bg-white/15"
                >
                  {s}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* شريط الإدخال */}
        <div className="flex items-center gap-1.5 border-t border-white/10 p-2.5">
          <button onClick={() => setShowStickers((v) => !v)} className="rounded-xl bg-white/10 px-2.5 py-2.5 text-lg transition hover:bg-white/20" title="ملصقات">
            🎭
          </button>
          <button
            onClick={() => document.getElementById('kg-img-input')?.click()}
            className="rounded-xl bg-white/10 px-2.5 py-2.5 text-lg transition hover:bg-white/20"
            title="صورة"
          >
            🖼
          </button>
          <input id="kg-img-input" type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && void sendImage(e.target.files[0])} />
          <button onClick={() => videoInputRef.current?.click()} className="rounded-xl bg-white/10 px-2.5 py-2.5 text-lg transition hover:bg-white/20" title="فيديو">
            🎬
          </button>
          <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && void sendVideo(e.target.files[0])} />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && text.trim()) {
                void send('text', text.trim())
                setText('')
              }
            }}
            placeholder={uploading ? '…جارٍ الإرسال' : 'اكتب رسالتك…'}
            className="flex-1 rounded-2xl border border-white/15 bg-black/40 px-4 py-2.5 text-sm outline-none focus:border-emerald-400"
          />
          <button
            onClick={() => {
              if (text.trim()) {
                void send('text', text.trim())
                setText('')
              }
            }}
            className="rounded-2xl bg-emerald-500 px-4 py-2.5 font-black text-black transition hover:brightness-110"
          >
            ➤
          </button>
        </div>
      </div>
    )
  }

  // ===== قائمة الأصدقاء =====
  return (
    <div className="space-y-3">
      {/* إضافة صديق */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-2 text-sm font-black">➕ إضافة صديق</div>
        <div className="flex gap-2">
          <input
            value={addValue}
            onChange={(e) => setAddValue(e.target.value)}
            placeholder="المعرف الرقمي أو @اسم المستخدم أو الاسم"
            className="flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"
          />
          <button
            onClick={() => {
              if (addValue.trim()) {
                void friendAction('add', { target: addValue.trim() })
                setAddValue('')
              }
            }}
            className="rounded-xl bg-emerald-500 px-4 font-black text-black transition hover:brightness-110"
          >
            إرسال
          </button>
        </div>
        {addMsg && <div className="mt-2 rounded-lg bg-black/40 p-2 text-xs font-bold text-zinc-300">{addMsg}</div>}
      </div>

      {/* طلبات واردة */}
      {threads.incoming.length > 0 && (
        <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
          <div className="mb-2 text-sm font-black text-amber-300">📬 طلبات الصداقة ({threads.incoming.length})</div>
          <div className="space-y-2">
            {threads.incoming.map((u) => (
              <div key={u.requestId} className="flex items-center gap-2 rounded-xl bg-black/30 p-2">
                <Avatar telegramId={u.telegramId} name={u.displayName} size={36} />
                <div className="flex-1 text-sm font-bold">{u.displayName}</div>
                <button onClick={() => void friendAction('accept', { requestId: u.requestId })} className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-black text-black">
                  قبول
                </button>
                <button onClick={() => void friendAction('reject', { requestId: u.requestId })} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-black">
                  رفض
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* الأصدقاء */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-2 text-sm font-black">👥 أصدقاؤك ({threads.friends.length})</div>
        {threads.friends.length ? (
          <div className="space-y-2">
            {threads.friends.map((u) => (
              <button
                key={u.telegramId}
                onClick={() => {
                  setActive(u)
                  setMsgs([])
                }}
                className="flex w-full items-center gap-3 rounded-xl bg-black/30 p-2.5 transition hover:bg-black/50"
              >
                <Avatar telegramId={u.telegramId} name={u.displayName} size={38} />
                <div className="flex-1 text-right">
                  <div className="text-sm font-bold">{u.displayName}</div>
                  <div className="text-[10px] text-zinc-500">{u.username ? `@${u.username}` : `ID: ${u.telegramId}`}</div>
                </div>
                <span className="text-lg">💬</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-zinc-500">لا أصدقاء بعد — أضف صديقك بمعرفه وتابع مبارياته!</div>
        )}
      </div>

      {threads.outgoing.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="mb-1 text-xs font-black text-zinc-400">⏳ طلبات أرسلتها ({threads.outgoing.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {threads.outgoing.map((u) => (
              <span key={u.requestId} className="rounded-lg bg-black/40 px-2 py-1 text-[11px] font-bold text-zinc-300">
                {u.displayName}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
