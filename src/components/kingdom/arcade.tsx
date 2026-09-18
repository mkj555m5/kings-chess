'use client'

// ============ ألعاب الأركيد 🕹️ ============
// ثلاث ألعاب خارجية (Gamezop) بأزرار لكل لعبة — تعمل في مساحة خاصة
// بشاشة كاملة مع زر رجوع: Final War Dead Zone / Blocks Adventure / Ludo With Friends

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface ArcadeGame {
  id: string
  title: string
  titleAr: string
  desc: string
  icon: string
  url: string
  grad: string
}

const GAMES: ArcadeGame[] = [
  {
    id: 'final-war',
    title: 'Final War Dead Zone',
    titleAr: 'الحرب النهائية',
    desc: 'معركة بقائك في المنطقة الميتة — سلاح وذكاء',
    icon: '🔫',
    url: 'https://zv1y2i8p.play.gamezop.com/g/gTD1yQp3R',
    grad: 'from-red-500/25 to-orange-500/10',
  },
  {
    id: 'blocks-adventure',
    title: 'Blocks Adventure',
    titleAr: 'مغامرة المكعبات',
    desc: 'رحلة غابة مليئة بالتحديات والمكعبات الملونة',
    icon: '🧩',
    url: 'https://zv1y2i8p.play.gamezop.com/g/UCS62KJ8c',
    grad: 'from-lime-500/25 to-emerald-500/10',
  },
  {
    id: 'ludo',
    title: 'Ludo With Friends',
    titleAr: 'لودو مع الأصدقاء',
    desc: 'لعبة اللودو الكلاسيكية — العب مع أصدقائك',
    icon: '🎲',
    url: 'https://zv1y2i8p.play.gamezop.com/g/SkhljT2fdgb',
    grad: 'from-sky-500/25 to-indigo-500/10',
  },
]

// ===== شبكة الألعاب في تبويب الألعاب — كل زر يفتح لعبته مباشرة =====
export function ArcadeSection({ onPlay }: { onPlay: (gameId?: string) => void }) {
  return (
    <div className="mt-2 space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="text-sm font-black text-zinc-300">🕹️ ألعاب الأركيد — مساحة خاصة</div>
        <span className="text-[10px] text-zinc-500">3 ألعاب</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {GAMES.map((g, i) => (
          <motion.button
            key={g.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => onPlay(g.id)}
            className={`rounded-3xl border border-white/10 bg-gradient-to-l ${g.grad} p-4 text-right shadow-lg transition hover:brightness-125`}
          >
            <div className="text-3xl">{g.icon}</div>
            <div className="mt-1.5 text-base font-black">{g.titleAr}</div>
            <div className="mt-0.5 line-clamp-2 text-[10px] text-zinc-400">{g.desc}</div>
            <div className="mt-2 inline-block rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-black text-white">▶ العب الآن</div>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

// ===== مساحة اللعب الخاصة (شاشة كاملة iframe) =====
export function ArcadePlayer({ onExit, initialGame }: { onExit: () => void; initialGame?: string | null }) {
  const [active, setActive] = useState<ArcadeGame | null>(() => GAMES.find((g) => g.id === initialGame) || null)

  // مساحة اللعب الكاملة
  if (active) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-black">
        <div className="flex items-center justify-between border-b border-white/10 bg-zinc-950 px-3 py-2">
          <button onClick={() => setActive(null)} className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold text-white transition hover:bg-white/20">
            ← رجوع للألعاب
          </button>
          <div className="text-sm font-black text-white">
            {active.icon} {active.titleAr}
          </div>
          <button onClick={onExit} className="rounded-xl bg-white/10 px-3 py-1.5 text-sm font-bold text-white transition hover:bg-white/20">
            🏠 الرئيسة
          </button>
        </div>
        <iframe
          key={active.id}
          src={active.url}
          title={active.title}
          className="h-full w-full flex-1 border-0 bg-black"
          allow="gamepad *; fullscreen *; autoplay"
          allowFullScreen
          seamless
        />
      </div>
    )
  }

  // قائمة اختيار اللعبة
  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#1a1a2e,#09090b_65%)] p-4 text-white">
      <div className="mx-auto max-w-md space-y-4 pt-8">
        <button onClick={onExit} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
          ← رجوع
        </button>
        <div className="pt-2 text-center">
          <div className="text-4xl">🕹️</div>
          <div className="mt-2 text-3xl font-black">ألعاب الأركيد</div>
          <div className="mt-1 text-sm text-zinc-400">اختر لعبتك — تعمل في مساحة خاصة بشاشة كاملة</div>
        </div>

        <div className="space-y-3">
          {GAMES.map((g, i) => (
            <motion.button
              key={g.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setActive(g)}
              className={`flex w-full items-center gap-4 rounded-3xl border border-white/10 bg-gradient-to-l ${g.grad} p-5 text-right shadow-lg transition hover:brightness-125`}
            >
              <div className="text-5xl">{g.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="text-xl font-black">{g.titleAr}</div>
                <div className="text-[11px] text-zinc-300">{g.title}</div>
                <div className="mt-0.5 truncate text-xs text-zinc-400">{g.desc}</div>
              </div>
              <div className="rounded-2xl bg-white/15 px-4 py-2.5 text-sm font-black">▶</div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )
}
