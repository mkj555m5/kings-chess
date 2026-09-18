'use client'

// ============ مشاهدة مباراة شطرنج مباشرة (قراءة فقط) ============
// ينضم لغرفة الشطرنج كمشاهد عبر spect:join ويعرض الرقعة والساعة والم保有
import { useEffect, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import { getSocket } from '@/lib/socket-client'
import { Avatar } from './avatar'

const PIECES: Record<string, string> = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
  K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟',
}

function fenToBoard(fen: string) {
  const rows = fen.split(' ')[0].split('/')
  const cells: { piece: string; white: boolean }[][] = []
  for (const row of rows) {
    const line: { piece: string; white: boolean }[] = []
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) line.push({ piece: '', white: true })
      } else {
        line.push({ piece: PIECES[ch] || '?', white: ch === ch.toUpperCase() })
      }
    }
    cells.push(line)
  }
  return cells
}

interface SpecState {
  fen: string
  turn: string
  moveNumber: number
  historySan: string[]
  clocks: { w: number; b: number }
  players: { white: { name: string; telegramId: string | null } | null; black: { name: string; telegramId: string | null } | null }
  status: { over: boolean; result: string | null; reason: string | null }
}

const fmtClock = (ms: number) => {
  if (!ms) return '—'
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function ChessSpectator({ code, onExit }: { code: string; onExit: () => void }) {
  const [state, setState] = useState<SpecState | null>(null)
  const [error, setError] = useState('')
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const socket = await getSocket()
      if (!alive) return
      socketRef.current = socket
      socket.emit('spect:join', { code }, (res: { ok: boolean; state?: SpecState; message?: string }) => {
        if (res?.ok && res.state) setState(res.state)
        else setError(res?.message || 'تعذر الانضمام للمشاهدة')
      })
      const onState = (s: SpecState) => setState(s)
      const onOver = () => {
        socket.emit('spect:join', { code }, (res: { ok: boolean; state?: SpecState }) => {
          if (res?.ok && res.state) setState(res.state)
        })
      }
      socket.on('game:state', onState)
      socket.on('game:over', onOver)
    })()
    return () => {
      alive = false
      void (async () => {
        const socket = socketRef.current
        if (socket) {
          socket.emit('spect:leave', { code })
          socket.off('game:state')
          socket.off('game:over')
        }
      })()
    }
  }, [code])

  const board = state ? fenToBoard(state.fen) : []
  const lastMove = state?.historySan?.[state.historySan.length - 1]

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,#0c2a4d,#09090b_65%)] pb-10 text-white">
      <div className="mx-auto max-w-lg space-y-3 p-4">
        <div className="flex items-center justify-between">
          <button onClick={onExit} className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold transition hover:bg-white/20">
            ← خروج
          </button>
          <div className="rounded-2xl bg-amber-500/20 px-4 py-1.5 text-sm font-black text-amber-300">👁️ مشاهدة مباشرة · غرفة {code}</div>
          <div className="w-16" />
        </div>

        {error && (
          <div className="rounded-2xl bg-rose-500/20 p-4 text-center text-sm font-bold text-rose-300">
            {error}
            <button onClick={onExit} className="mt-2 block w-full rounded-xl bg-white/10 py-2 font-bold">
              رجوع
            </button>
          </div>
        )}

        {state && (
          <>
            {/* اللاعبان */}
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <Avatar telegramId={state.players.black?.telegramId} name={state.players.black?.name || '—'} size={36} ring="#94a3b8" />
                <div>
                  <div className="text-sm font-bold">⚫ {state.players.black?.name || 'في انتظار'}</div>
                  <div className="font-mono text-xs text-zinc-400">{fmtClock(state.clocks.b)}</div>
                </div>
              </div>
              <div className="text-center text-[10px] font-black text-zinc-500">
                نقلة {state.moveNumber}
                <div className="text-amber-300">{state.status.over ? '🏁 انتهت' : state.turn === 'w' ? '⚪ دور الأبيض' : '⚫ دور الأسود'}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-left">
                  <div className="text-sm font-bold">⚪ {state.players.white?.name || 'في انتظار'}</div>
                  <div className="font-mono text-xs text-zinc-400">{fmtClock(state.clocks.w)}</div>
                </div>
                <Avatar telegramId={state.players.white?.telegramId} name={state.players.white?.name || '—'} size={36} ring="#e2e8f0" />
              </div>
            </div>

            {/* الرقعة */}
            <div className="overflow-hidden rounded-2xl border-4 border-[#5d4037] shadow-2xl">
              <div className="grid grid-cols-8">
                {board.map((row, r) =>
                  row.map((cell, c) => {
                    const dark = (r + c) % 2 === 1
                    const lastRank = lastMove ? lastMove.slice(-1) : null
                    return (
                      <div
                        key={`${r}-${c}`}
                        className={`flex aspect-square items-center justify-center text-[min(7vw,34px)] leading-none ${
                          dark ? 'bg-[#b58863]' : 'bg-[#f0d9b5]'
                        } ${state.turn === 'w' && cell.piece && cell.white ? 'ring-1 ring-inset ring-emerald-400/40' : ''}`}
                      >
                        <span className={cell.white ? 'text-white [text-shadow:0_1px_2px_#0009]' : 'text-[#1a1a1a] [text-shadow:0_1px_1px_#0002]'}>{cell.piece}</span>
                      </div>
                    )
                  }),
                )}
              </div>
            </div>

            {/* آخر النقلات */}
            <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
              <div className="mb-1 text-xs font-black text-zinc-400">📜 آخر النقلات</div>
              <div className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto text-xs" dir="ltr">
                {state.historySan.slice(-14).map((san, i) => (
                  <span key={i} className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-zinc-200">
                    {san}
                  </span>
                ))}
              </div>
            </div>

            {state.status.over && (
              <div className="rounded-2xl bg-amber-500/20 p-3 text-center font-black text-amber-300">
                {state.status.result === 'draw' ? '🤝 تعادل' : `🏆 الفائز: ${state.status.result === 'white' ? state.players.white?.name : state.players.black?.name}`}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
