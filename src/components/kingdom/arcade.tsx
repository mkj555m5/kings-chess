'use client'

// ============ ألعاب الأركيد 🕹️ ============
// لعبة Sonic Escape — مستضافة محلياً (نسخة كاملة من itch.io بدون قيود التضمين)
// المصدر: https://saucekye.itch.io/sonic-escape — ملفات Godot في public/games/sonic-escape
// index.pck (192MB) غير مرفوع لـGitHub: يُجمَّع من index.pck.part-* في buildCommand

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

interface ArcadeGame {
  id: string
  title: string
  titleAr: string
  desc: string
  icon: string
  url: string
  allow: string
  grad: string
}

const ITCH_ALLOW = 'autoplay; fullscreen *; geolocation; microphone; camera; midi; monetization; xr-spatial-tracking; gamepad; gyroscope; accelerometer; xr; cross-origin-isolated; web-share'

const GAMES: ArcadeGame[] = [
  {
    id: 'sonic-escape',
    title: 'Sonic Escape V0.9',
    titleAr: 'سونيك إسكيب',
    desc: 'اهرب واجري مع سونيك — لعبة أكشن وسرعة (نسخة مستضافة كاملة)',
    icon: '🦔',
    url: '/games/sonic-escape/index.html',
    allow: ITCH_ALLOW,
    grad: 'from-sky-500/25 to-blue-600/10',
  },
]

// ===== شبكة الألعاب في تبويب الألعاب — كل زر يفتح لعبته مباشرة =====
export function ArcadeSection({ onPlay }: { onPlay: (gameId?: string) => void }) {
  return (
    <div className="mt-2 space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="text-sm font-black text-zinc-300">🕹️ ألعاب الأركيد — مساحة خاصة</div>
        <span className="text-[10px] text-zinc-500">{GAMES.length} ألعاب</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {GAMES.map((g) => (
          <motion.button
            key={g.id}
            whileTap={{ scale: 0.97 }}
            onClick={() => onPlay(g.id)}
            className={`rounded-3xl border border-white/10 bg-gradient-to-l ${g.grad} p-4 text-right shadow-lg transition hover:brightness-125`}
          >
            <div className="text-3xl">{g.icon}</div>
            <div className="mt-1.5 text-base font-black">{g.titleAr}</div>
            <div className="mt-0.5 line-clamp-2 text-[10px] text-zinc-400">{g.desc}</div>
            <div className="mt-2 inline-block rounded-lg bg-white/10 px-2.5 py-1 text-[10px] font-black text-white">▶ Run Game</div>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

// ===== مساحة اللعب الخاصة (شاشة كاملة iframe — نفس كود itch.io) =====
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
        {/* نفس كود التضمين الأصلي من زر Run game في صفحة اللعبة على itch.io */}
        <iframe
          key={active.id}
          id="game_drop"
          src={active.url}
          title={active.title}
          className="h-full w-full flex-1 border-0 bg-black"
          allow={active.allow}
          allowFullScreen
          scrolling="no"
          allowTransparency
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
