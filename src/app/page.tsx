'use client'

// شطرنج الملوك - الصفحة الرئيسية: إدارة المشاهد (القائمة / المباراة)
// + معالجة روابط بوت تلجرام: تسجيل دخول تلقائي (?auth=TOKEN) وربط التحديات (?challenge=CODE)
import { useCallback, useEffect, useRef, useState } from 'react'
import { MenuScreen } from '@/components/chess/menu-screen'
import { AIGame, type AIGameConfig } from '@/components/chess/ai-game'
import { OnlineGame, type OnlineGameConfig } from '@/components/chess/online-game'
import { StatsDialog } from '@/components/chess/stats-dialog'
import { loadLocalStats, getPlayerName, setPlayerName, type LocalStats } from '@/lib/local-stats'
import { isSoundEnabled, setSoundEnabled, getSoundVolume, setSoundVolume } from '@/lib/sound'
import { getTelegramSession, exchangeLoginToken, exchangeMiniAppSession, clearTelegramSession, type TelegramSession } from '@/lib/telegram-session'
import { loadTelegramWebApp } from '@/lib/telegram-mini-app'
import type { TimeControl } from '@/lib/game-types'
import { useToast } from '@/hooks/use-toast'

type View = { screen: 'menu' } | { screen: 'ai'; config: AIGameConfig } | { screen: 'online'; config: OnlineGameConfig }

export default function Home() {
  const [view, setView] = useState<View>({ screen: 'menu' })
  const [playerName, setPlayerNameState] = useState('')
  const [localStats, setLocalStats] = useState<LocalStats | null>(null)
  const [soundOn, setSoundOn] = useState(true)
  const [volume, setVolume] = useState(0.6)
  const [statsOpen, setStatsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [tgUser, setTgUser] = useState<TelegramSession | null>(null)
  const deepLinkHandled = useRef(false)
  const { toast } = useToast()

  useEffect(() => {
    const t = setTimeout(() => {
      setMounted(true)
      setPlayerNameState(getPlayerName())
      setLocalStats(loadLocalStats())
      setSoundOn(isSoundEnabled())
      setVolume(getSoundVolume())
      setTgUser(getTelegramSession())
    }, 0)
    return () => clearTimeout(t)
  }, [])

  // روابط بوت تلجرام: ?auth=TOKEN (دخول تلقائي) و ?challenge=CODE (الانضمام لتحدي)
  // + الفتح داخل تلجرام نفسه (Mini App): دخول تلقائي دائم عبر initData الموّقعة رقمياً
  useEffect(() => {
    if (!mounted || deepLinkHandled.current) return
    deepLinkHandled.current = true

    const params = new URLSearchParams(window.location.search)
    const auth = params.get('auth')
    const challenge = (params.get('challenge') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)

    // تنظيف الرابط من المعاملات فوراً (حتى لا يتشارك الزائر الرمز بالمصادفة)
    if (auth || challenge) window.history.replaceState({}, '', window.location.pathname)

    const run = async () => {
      // 0) هل اللعبة مفتوحة داخل تلجرام؟ (زر البوت أو زر القائمة ☰)
      const wa = await loadTelegramWebApp()
      try {
        wa?.ready?.()
        wa?.expand?.()
      } catch {
        // عميل تلجرام قديم — تجاهل
      }
      const initData = String(wa?.initData || '')

      // 1) تسجيل الدخول التلقائي
      let loggedIn = false
      if (initData) {
        // الأولوية: توقيع تلجرام الرقمي — دائم ولا تنتهي صلاحيته أبداً
        const session = await exchangeMiniAppSession(initData)
        if (session) {
          setTgUser(session)
          setPlayerNameState(session.name)
          setPlayerName(session.name)
          toast({ title: `مرحباً ${session.name} 👋`, description: 'أنت متصل عبر تلجرام — دخول تلقائي دائم', duration: 4000 })
          loggedIn = true
        }
      }
      if (!loggedIn && auth) {
        // احتياطي: رمز سحري من رابط البوت (عند الفتح في متصفح خارجي)
        const session = await exchangeLoginToken(auth)
        if (session) {
          setTgUser(session)
          setPlayerNameState(session.name)
          setPlayerName(session.name)
          toast({ title: `مرحباً ${session.name} 👋`, description: 'تم تسجيل دخولك تلقائياً عبر تلجرام', duration: 4000 })
        } else {
          toast({ title: 'انتهت صلاحية رابط الدخول', description: 'افتح البوت وأرسل /login للحصول على رابط جديد — أو استخدم زر ☰ داخل تلجرام', variant: 'destructive', duration: 6000 })
        }
      }

      // 2) الانضمام لتحدي من البوت (من الرابط أو من start_param داخل تلجرام)
      const startParam = String(wa?.initDataUnsafe?.start_param || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
      const code = challenge.length === 5 ? challenge : startParam.length === 5 ? startParam : ''
      if (code.length === 5) {
        let tc: TimeControl = 'none'
        let fromName = 'صديقك'
        try {
          const res = await fetch(`/api/telegram/challenge?code=${code}`)
          const data = await res.json()
          if (data?.ok && data.challenge) {
            tc = (['none', 'blitz3', 'blitz5', 'rapid10'].includes(data.challenge.timeControl) ? data.challenge.timeControl : 'none') as TimeControl
            fromName = String(data.challenge.fromName || 'صديقك')
            if (data.challenge.status === 'expired') {
              toast({ title: 'انتهت صلاحية التحدي ⌛', description: 'اطلب من صديقك إنشاء تحدي جديد من البوت', variant: 'destructive', duration: 6000 })
              return
            }
          }
        } catch {
          // لا مشكلة — سنحاول الانضمام مباشرة
        }
        // الاسم: جلسة تلجرام ثم الاسم المحفوظ ثم اسم زائر
        const name = getTelegramSession()?.name || getPlayerName() || `زائر ${Math.floor(1000 + Math.random() * 9000)}`
        setPlayerNameState(name)
        setPlayerName(name)
        toast({ title: `⚔️ تحدي من ${fromName}`, description: 'جارٍ الدخول للمباراة…', duration: 4000 })
        setView({ screen: 'online', config: { playerName: name, timeControl: tc, flow: 'challenge', joinCode: code } })
      }
    }

    void run()
  }, [mounted, toast])

  const updatePlayerName = useCallback((n: string) => {
    setPlayerNameState(n)
    setPlayerName(n)
  }, [])

  const logoutTelegram = useCallback(() => {
    clearTelegramSession()
    setTgUser(null)
    toast({ title: 'تم تسجيل الخروج من تلجرام' })
  }, [toast])

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev
      setSoundEnabled(next)
      return next
    })
  }, [])

  const changeVolume = useCallback((v: number) => {
    setVolume(v)
    setSoundVolume(v)
  }, [])

  return (
    <main className="min-h-screen">
      {view.screen === 'menu' && (
        <MenuScreen
          playerName={playerName}
          onPlayerNameChange={updatePlayerName}
          soundOn={soundOn}
          onToggleSound={toggleSound}
          volume={volume}
          onVolumeChange={changeVolume}
          tgUser={tgUser}
          onTelegramLogout={logoutTelegram}
          localStats={localStats ?? {
            wins: 0, losses: 0, draws: 0, aiWins: 0, onlineWins: 0,
            currentStreak: 0, bestStreak: 0, gamesPlayed: 0, history: [],
          }}
          onStartAI={(config) => setView({ screen: 'ai', config })}
          onStartOnline={(config) => setView({ screen: 'online', config })}
          onStartLocal={() =>
            setView({
              screen: 'ai',
              config: {
                mode: 'local',
                difficulty: 'medium',
                playerColor: 'white',
                timeControl: 'none',
                playerName: 'اللاعبان',
              },
            })
          }
          onOpenStats={() => setStatsOpen(true)}
        />
      )}

      {view.screen === 'ai' && (
        <AIGame
          config={{ ...view.config, telegramId: tgUser?.telegramId || null }}
          onExit={() => {
            setLocalStats(loadLocalStats())
            setView({ screen: 'menu' })
          }}
          onStats={(s) => setLocalStats(s)}
        />
      )}

      {view.screen === 'online' && (
        <OnlineGame
          config={{ ...view.config, telegramId: tgUser?.telegramId || null }}
          onExit={() => {
            setLocalStats(loadLocalStats())
            setView({ screen: 'menu' })
          }}
          onStats={(s) => setLocalStats(s)}
        />
      )}

      {mounted && (
        <StatsDialog
          open={statsOpen}
          onOpenChange={setStatsOpen}
          localStats={localStats ?? {
            wins: 0, losses: 0, draws: 0, aiWins: 0, onlineWins: 0,
            currentStreak: 0, bestStreak: 0, gamesPlayed: 0, history: [],
          }}
          onLocalStatsChange={(s) => setLocalStats(s)}
          playerName={playerName}
        />
      )}
    </main>
  )
}
