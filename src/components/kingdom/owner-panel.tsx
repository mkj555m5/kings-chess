'use client'

// ============ لوحة تحكم المالك (من الموقع) ============
// أكواد الشحن: إنشاء/إيقاف/حذف + تعديل نقاط اللاعبين + إحصائيات عامة

import { useCallback, useEffect, useState } from 'react'
import { Avatar } from './avatar'

interface CodeRow {
  id: string
  code: string
  points: number
  maxUses: number
  uses: number
  active: boolean
  note: string | null
  redemptions: number
}

interface UserRow {
  telegramId: string
  displayName: string
  username: string | null
  points: number
  isOwner: boolean
  lastSeenAt: string
}

interface Props {
  tgId: string
  onToast: (msg: string) => void
}

export function OwnerPanel({ tgId, onToast }: Props) {
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [stats, setStats] = useState<{ users: number; matches: number; points: number } | null>(null)
  const [codes, setCodes] = useState<CodeRow[]>([])
  const [users, setUsers] = useState<UserRow[]>([])
  const [newPoints, setNewPoints] = useState('50')
  const [newMaxUses, setNewMaxUses] = useState('10')
  const [newNote, setNewNote] = useState('')
  const [pointTarget, setPointTarget] = useState('')
  const [pointDelta, setPointDelta] = useState('100')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/kingdom/owner?tgId=${tgId}`)
      const data = await res.json()
      if (res.status === 403) {
        setAllowed(false)
        return
      }
      setAllowed(true)
      if (data.ok) {
        setStats(data.stats)
        setCodes(data.codes)
        setUsers(data.users)
      }
    } catch {
      setAllowed(false)
    }
  }, [tgId])

  useEffect(() => {
    void load()
  }, [load])

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    try {
      const res = await fetch('/api/kingdom/owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tgId, action, ...extra }),
      })
      const data = await res.json()
      if (data.ok) {
        onToast(action === 'create-code' ? `✅ كود جديد: ${data.code.code}` : '✅ تم التنفيذ')
        void load()
      } else {
        onToast(`⚠️ ${data.error || 'فشل'}`)
      }
    } catch {
      onToast('⚠️ خطأ في الاتصال')
    }
  }

  if (allowed === null) return <div className="rounded-2xl bg-white/5 p-8 text-center text-sm text-zinc-400">…جارٍ الفحص</div>
  if (!allowed)
    return (
      <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-center">
        <div className="text-xl font-black text-rose-300">🚫 لوحة المالك</div>
        <div className="mt-1 text-sm text-zinc-300">هذه اللوحة متاحة لحساب المالك فقط (المعرف في TELEGRAM_OWNER_ID).</div>
      </div>
    )

  return (
    <div className="space-y-4">
      {/* إحصائيات */}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ['👥 اللاعبون', stats?.users],
            ['🎮 المباريات', stats?.matches],
            ['⭐ مجموع النقاط', stats?.points],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
            <div className="text-2xl font-black text-amber-300">{v ?? '—'}</div>
            <div className="text-[10px] text-zinc-400">{label}</div>
          </div>
        ))}
      </div>

      {/* إنشاء كود */}
      <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-4">
        <div className="mb-2 text-sm font-black text-emerald-300">🎫 إنشاء كود شحن نقاط</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <input value={newPoints} onChange={(e) => setNewPoints(e.target.value.replace(/\D/g, ''))} placeholder="النقاط" className="rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
          <input value={newMaxUses} onChange={(e) => setNewMaxUses(e.target.value.replace(/\D/g, ''))} placeholder="عدد الاستخدامات" className="rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
          <input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="ملاحظة (اختياري)" className="col-span-2 rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
        </div>
        <button onClick={() => void act('create-code', { points: Number(newPoints), maxUses: Number(newMaxUses), note: newNote })} className="mt-2 w-full rounded-xl bg-emerald-500 py-2.5 font-black text-black transition hover:brightness-110">
          إنشاء الكود الآن
        </button>
      </div>

      {/* الأكواد */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-2 text-sm font-black">🎫 أكواد الشحن ({codes.length})</div>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {codes.map((c) => (
            <div key={c.id} className={`flex items-center gap-2 rounded-xl p-2.5 ${c.active ? 'bg-black/30' : 'bg-black/50 opacity-50'}`}>
              <div className="flex-1">
                <div className="font-mono text-sm font-black text-amber-300">{c.code}</div>
                <div className="text-[10px] text-zinc-500">
                  {c.points} نقطة · استُخدم {c.uses}/{c.maxUses}
                  {c.note ? ` · ${c.note}` : ''}
                </div>
              </div>
              <button onClick={() => void act('toggle-code', { code: c.code })} className="rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] font-bold">
                {c.active ? 'إيقاف' : 'تشغيل'}
              </button>
              <button onClick={() => void act('delete-code', { code: c.code })} className="rounded-lg bg-rose-500/20 px-2.5 py-1.5 text-[11px] font-bold text-rose-300">
                حذف
              </button>
            </div>
          ))}
          {!codes.length && <div className="py-3 text-center text-xs text-zinc-500">لا أكواد بعد</div>}
        </div>
      </div>

      {/* تعديل نقاط */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-2 text-sm font-black">⭐ تعديل نقاط لاعب</div>
        <div className="flex gap-2">
          <input value={pointTarget} onChange={(e) => setPointTarget(e.target.value.replace(/\D/g, ''))} placeholder="معرف اللاعب الرقمي" className="flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
          <input value={pointDelta} onChange={(e) => setPointDelta(e.target.value.replace(/[^\d-]/g, ''))} placeholder="±نقاط" className="w-24 rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
          <button onClick={() => void act('add-points', { target: pointTarget, delta: Number(pointDelta) })} className="rounded-xl bg-amber-400 px-4 font-black text-black">
            تنفيذ
          </button>
        </div>
      </div>

      {/* المستخدمون */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-2 text-sm font-black">👥 أغلب اللاعبين نقاطاً</div>
        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {users.map((u) => (
            <div key={u.telegramId} className="flex items-center gap-2 rounded-xl bg-black/30 p-2">
              <Avatar telegramId={u.telegramId} name={u.displayName} size={32} />
              <div className="flex-1">
                <div className="text-sm font-bold">
                  {u.displayName} {u.isOwner && '👑'}
                </div>
                <div className="font-mono text-[10px] text-zinc-500">{u.telegramId}</div>
              </div>
              <div className="text-lg font-black tabular-nums text-amber-300">{u.points}</div>
              <button
                onClick={() => {
                  setPointTarget(u.telegramId)
                  onToast(`📌 تم اختيار ${u.displayName} — اكتب عدد النقاط واضغط تنفيذ`)
                }}
                className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold"
              >
                اختيار
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
