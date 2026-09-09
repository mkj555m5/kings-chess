'use client'

// شطرنج الملوك - الصفحة الرئيسية: إدارة المشاهد (القائمة / المباراة)
import { useCallback, useEffect, useState } from 'react'
import { MenuScreen } from '@/components/chess/menu-screen'
import { AIGame, type AIGameConfig } from '@/components/chess/ai-game'
import { OnlineGame, type OnlineGameConfig } from '@/components/chess/online-game'
import { StatsDialog } from '@/components/chess/stats-dialog'
import { loadLocalStats, getPlayerName, setPlayerName, type LocalStats } from '@/lib/local-stats'
import { isSoundEnabled, setSoundEnabled } from '@/lib/sound'

type View = { screen: 'menu' } | { screen: 'ai'; config: AIGameConfig } | { screen: 'online'; config: OnlineGameConfig }

export default function Home() {
  const [view, setView] = useState<View>({ screen: 'menu' })
  const [playerName, setPlayerNameState] = useState('')
  const [localStats, setLocalStats] = useState<LocalStats | null>(null)
  const [soundOn, setSoundOn] = useState(true)
  const [statsOpen, setStatsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setMounted(true)
      setPlayerNameState(getPlayerName())
      setLocalStats(loadLocalStats())
      setSoundOn(isSoundEnabled())
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const updatePlayerName = useCallback((n: string) => {
    setPlayerNameState(n)
    setPlayerName(n)
  }, [])

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev
      setSoundEnabled(next)
      return next
    })
  }, [])

  return (
    <main className="min-h-screen">
      {view.screen === 'menu' && (
        <MenuScreen
          playerName={playerName}
          onPlayerNameChange={updatePlayerName}
          soundOn={soundOn}
          onToggleSound={toggleSound}
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
          config={view.config}
          onExit={() => {
            setLocalStats(loadLocalStats())
            setView({ screen: 'menu' })
          }}
          onStats={(s) => setLocalStats(s)}
        />
      )}

      {view.screen === 'online' && (
        <OnlineGame
          config={view.config}
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
