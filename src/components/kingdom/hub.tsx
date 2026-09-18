'use client'

// ============ 🏰 مملكة الألعاب — الهيكل الرئيسي ============
// شبكة الألعاب (شطرنج/XO/مزاد/مجهول) + النقاط والتصنيف + الأصدقاء
// + أكواد الشحن + لوحة المالك — مع صورة الشخصية ومعرف تلجرام الموثق

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { rankFor, ALL_CARDS, percentFor } from '@/lib/cards-data'
import { Avatar } from './avatar'
import { PlayerCard } from './player-card'
import { Leaderboard } from './leaderboard'
import { FriendsPanel } from './friends'
import { OwnerPanel } from './owner-panel'
import { XoGame } from './xo'
import { AuctionGame } from './auction'
import { MysteryGame } from './mystery'

export interface KingdomUser {
  telegramId: string
  displayName: string
  username?: string | null
  isOwner: boolean
  points: number
  verified: boolean
  rank: { name: string; color: string; icon: string; min: number }
  rankPos: number
}

type Tab = 'games' | 'rank' | 'friends' | 'codes' | 'owner'
type GameView = null | 'chess' | 'xo' | 'auction-classic' | 'auction-promax' | 'mystery'

interface Props {
  tgId: string | null
  name: string
  onOpenChess: () => void
  onToast: (title: string, desc?: string) => void
  onSpectateChess: (code: string) => void
}

export function KingdomHub({ tgId, name, onOpenChess, onToast, onSpectateChess }: Props) {
  const [tab, setTab] = useState<Tab>('games')
  const [game, setGame] = useState<GameView>(null)
  const [user, setUser] = useState<KingdomUser | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [codeMsg, setCodeMsg] = useState('')
  const [showCards, setShowCards] = useState(false)
  const [localPoints, setLocalPoints] = useState(0)

  const loadMe = useCallback(async () => {
    if (!tgId) return
    try {
      const res = await fetch(`/api/kingdom/me?tgId=${tgId}&name=${encodeURIComponent(name)}`)
      const data = await res.json()
      if (data.ok) setUser(data.user)
    } catch {
      // تجاهل
    }
  }, [tgId, name])

  useEffect(() => {
    void loadMe()
  }, [loadMe, localPoints])

  // الاستماع لطلب مشاهدة غرفة شطرنج من قائمة XO
  useEffect(() => {
    const h = (e: Event) => {
      const code = (e as CustomEvent).detail?.code
      if (code) onSpectateChess(code)
    }
    window.addEventListener('kingdom:spectate-chess', h)
    return () => window.removeEventListener('kingdom:spectate-chess', h)
  }, [onSpectateChess])

  const addPoints = useCallback((delta: number) => {
    setLocalPoints((p) => p + delta)
    onToast(`+${delta} نقطة! 🎉`, 'تم تحديث رصيدك في المملكة')
  }, [onToast])

  const redeem = async () => {
    if (!tgId || !codeInput.trim()) return
    try {
      const res = await fetch('/api/kingdom/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tgId, code: codeInput }),
      })
      const data = await res.json()
      if (data.ok) {
        setCodeMsg(`✅ ربحت ${data.points} نقطة! رصيدك الآن: ${data.balance}`)
        setLocalPoints((p) => p + 0.1) // تحديث العرض
      } else {
        setCodeMsg(`⚠️ ${data.error}`)
      }
    } catch {
      setCodeMsg('⚠️ خطأ في الاتصال')
    }
    setTimeout(() => setCodeMsg(''), 5000)
  }

  const rank = user ? rankFor(user.points) : rankFor(0)
  const displayPoints = user?.points ?? 0

  // ===== شاشات الألعاب =====
  if (game && game !== 'chess') {
    const exit = () => setGame(null)
    if (game === 'xo')
      return <XoGame tgId={tgId} name={name} onExit={exit} onPoints={addPoints} />
    if (game === 'auction-classic')
      return <AuctionGame key="ac" tgId={tgId || ''} name={name} mode="classic" onExit={exit} onPoints={addPoints} />
    if (game === 'auction-promax')
      return <AuctionGame key="ap" tgId={tgId || ''} name={name} mode="promax" onExit={exit} onPoints={addPoints} />
    if (game === 'mystery')
      return <MysteryGame tgId={tgId || ''} name={name} onExit={exit} onPoints={addPoints} />
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#1a1a2e,#09090b_60%)] pb-24 text-white">
      <div className="mx-auto max-w-2xl space-y-4 p-3 sm:p-5">
        {/* بطاقة الملف الشخصي */}
        <div className="flex items-center gap-3 rounded-3xl border border-white/10 bg-gradient-to-l from-amber-500/10 via-white/5 to-transparent p-4">
          <Avatar telegramId={tgId} name={name} size={58} ring={rank.color} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-lg font-black">{name}</span>
              {tgId && (
                <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-black text-emerald-300" title="حساب موثق عبر تلجرام">
                  ✔ موثق
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
              <span className="font-bold" style={{ color: rank.color }}>
                {rank.icon} {rank.name}
              </span>
              <span className="text-amber-300">⭐ {displayPoints} نقطة</span>
              {user && <span className="text-zinc-500">#{user.rankPos} عالمياً</span>}
            </div>
            {tgId && (
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(tgId)
                  onToast('🆔 تم نسخ معرفك', tgId)
                }}
                className="mt-1 rounded-lg bg-black/40 px-2 py-0.5 font-mono text-[10px] text-zinc-400 transition hover:text-white"
                title="اضغط للنسخ"
              >
                ID: {tgId} 📋
              </button>
            )}
          </div>
          <button onClick={() => setShowCards(true)} className="rounded-2xl bg-white/10 px-3 py-2 text-xs font-black transition hover:bg-white/20" title="معرض الكروت">
            🃏 {ALL_CARDS.length}
          </button>
        </div>

        {!tgId && (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-center text-sm font-bold text-amber-200">
            🔑 سجّل دخولك عبر بوت تلجرام (/login) لحفظ نقاطك والمنافسة في التصنيف
          </div>
        )}

        {/* التبويبات */}
        <div className="flex gap-1.5 overflow-x-auto rounded-2xl bg-white/5 p-1.5">
          {(
            [
              ['games', '🎮 الألعاب'],
              ['rank', '🏆 التصنيف'],
              ['friends', '👥 الأصدقاء'],
              ['codes', '🎫 أكواد'],
              ...(user?.isOwner ? [['owner', '👑 المالك']] : []),
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-black transition ${tab === id ? 'bg-amber-400 text-black shadow' : 'text-zinc-300 hover:bg-white/10'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* المحتوى */}
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18 }}>
            {tab === 'games' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <GameTile
                  title="شطرنج الملوك"
                  desc="ضد الوزير الذكي أو أصدقائك أونلاين"
                  icon="♟️"
                  grad="from-indigo-500/25 to-purple-500/10"
                  onClick={onOpenChess}
                />
                <GameTile title="لعبة XO" desc="ضد AI أو أونلاين + مشاهدة مباشرة" icon="⭕" grad="from-emerald-500/25 to-teal-500/10" onClick={() => setGame('xo')} />
                <GameTile
                  title="سوبر المزاد — كلاسيك"
                  desc="٥٠ مليون · ٦ جولات · كروت من ٨٠ حتى ٩٩"
                  icon="⚽"
                  grad="from-amber-500/25 to-orange-500/10"
                  onClick={() => setGame('auction-classic')}
                />
                <GameTile
                  title="سوبر المزاد — برو ماكس"
                  desc="٢٠٠ مليون · ١٢ جولة · كروت قوية أكثر"
                  icon="💎"
                  grad="from-sky-500/25 to-blue-500/10"
                  onClick={() => setGame('auction-promax')}
                />
                <GameTile
                  title="اللاعب المجهول"
                  desc="بطاقة ظاهرة وبطاقة سوداء… قلبك مع مين؟"
                  icon="🃏"
                  grad="from-purple-500/25 to-fuchsia-500/10"
                  onClick={() => setGame('mystery')}
                />
              </div>
            )}

            {tab === 'rank' && <Leaderboard myTgId={tgId} />}

            {tab === 'friends' && tgId && <FriendsPanel tgId={tgId} name={name} />}
            {tab === 'friends' && !tgId && (
              <div className="rounded-2xl bg-white/5 p-8 text-center text-sm text-zinc-400">سجّل دخولك عبر تلجرام أولاً لإضافة الأصدقاء 💬</div>
            )}

            {tab === 'codes' && (
              <div className="space-y-3">
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-4">
                  <div className="mb-2 text-sm font-black text-emerald-300">🎫 خانة الأكواد — استبدل كودك بنقاط</div>
                  <div className="flex gap-2">
                    <input
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                      placeholder="مثال: KING-XXXX-XXXX"
                      className="flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 font-mono text-sm outline-none focus:border-emerald-400"
                    />
                    <button onClick={redeem} disabled={!tgId} className="rounded-xl bg-emerald-500 px-5 font-black text-black transition enabled:hover:brightness-110 disabled:opacity-40">
                      استبدال
                    </button>
                  </div>
                  {codeMsg && <div className="mt-2 rounded-lg bg-black/40 p-2 text-xs font-bold">{codeMsg}</div>}
                  {!tgId && <div className="mt-2 text-[11px] text-zinc-500">سجّل دخولك عبر البوت أولاً</div>}
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-400">
                  💡 الأكواد يوزعها مالك المملكة من لوحة التحكم أو عبر البوت — تابع قنواتك!
                </div>
              </div>
            )}

            {tab === 'owner' && user?.isOwner && tgId && <OwnerPanel tgId={tgId} onToast={(m) => onToast(m)} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* معرض الكروت */}
      <AnimatePresence>
        {showCards && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 overflow-y-auto bg-black/90 p-4" onClick={() => setShowCards(false)}>
            <div className="mx-auto max-w-4xl" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 z-10 -mx-4 mb-3 bg-black/80 p-3 text-center backdrop-blur">
                <div className="text-xl font-black text-amber-300">🃏 معرض الكروت — {ALL_CARDS.length} لاعب</div>
                <div className="text-[11px] text-zinc-400">كل كرت له نسبة ظهور في المزاد — النجوم النادرة أصعب حظاً!</div>
                <button onClick={() => setShowCards(false)} className="absolute left-3 top-3 rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold">
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap justify-center gap-3 pb-8">
                {ALL_CARDS.slice()
                  .sort((a, b) => b.rating - a.rating)
                  .map((c) => (
                    <div key={c.id} className="text-center">
                      <PlayerCard card={c} size={104} />
                      <div className="mt-0.5 text-[9px] text-zinc-500">ظهور {percentFor(c.rating)}%</div>
                    </div>
                  ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function GameTile({ title, desc, icon, grad, onClick }: { title: string; desc: string; icon: string; grad: string; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`rounded-3xl border border-white/10 bg-gradient-to-l ${grad} p-5 text-right shadow-lg transition hover:brightness-125`}
    >
      <div className="text-4xl">{icon}</div>
      <div className="mt-2 text-xl font-black">{title}</div>
      <div className="mt-0.5 text-xs text-zinc-400">{desc}</div>
    </motion.button>
  )
}
