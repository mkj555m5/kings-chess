// مؤثرات صوتية مولّدة برمجياً عبر Web Audio API (بدون ملفات خارجية)
let audioCtx: AudioContext | null = null
let soundEnabled = true

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled
  if (typeof window !== 'undefined') {
    localStorage.setItem('chess-sound', enabled ? '1' : '0')
  }
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  const saved = localStorage.getItem('chess-sound')
  return saved !== '0'
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

function tone(freq: number, duration: number, type: OscillatorType, gainValue: number, when = 0, slideTo?: number) {
  const ctx = getCtx()
  if (!ctx) return
  const t0 = ctx.currentTime + when
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t0 + duration)
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(gainValue, t0 + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.05)
}

function noiseBurst(duration: number, gainValue: number, filterFreq: number, when = 0) {
  const ctx = getCtx()
  if (!ctx) return
  const t0 = ctx.currentTime + when
  const length = Math.floor(ctx.sampleRate * duration)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length)
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = filterFreq
  const gain = ctx.createGain()
  gain.gain.value = gainValue
  src.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)
  src.start(t0)
}

export const sfx = {
  move() {
    if (!soundEnabled) return
    tone(320, 0.07, 'sine', 0.22, 0, 210)
    noiseBurst(0.05, 0.12, 2400)
  },
  capture() {
    if (!soundEnabled) return
    tone(180, 0.12, 'square', 0.18, 0, 90)
    noiseBurst(0.09, 0.22, 1400)
  },
  castle() {
    if (!soundEnabled) return
    tone(300, 0.06, 'sine', 0.2, 0, 220)
    tone(260, 0.06, 'sine', 0.2, 0.09, 190)
  },
  check() {
    if (!soundEnabled) return
    tone(880, 0.1, 'triangle', 0.25)
    tone(988, 0.12, 'triangle', 0.25, 0.12)
  },
  select() {
    if (!soundEnabled) return
    tone(520, 0.04, 'sine', 0.12)
  },
  win() {
    if (!soundEnabled) return
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.22, i * 0.13))
  },
  lose() {
    if (!soundEnabled) return
    ;[440, 349, 262].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.14, i * 0.16))
  },
  draw() {
    if (!soundEnabled) return
    ;[440, 440].forEach((f, i) => tone(f, 0.15, 'triangle', 0.18, i * 0.2))
  },
  aiThinking() {
    if (!soundEnabled) return
    tone(660, 0.05, 'sine', 0.08)
  },
  chatMessage() {
    if (!soundEnabled) return
    tone(720, 0.06, 'sine', 0.14, 0, 880)
  },
}
