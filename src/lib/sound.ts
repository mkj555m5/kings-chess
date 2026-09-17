'use client'

// محرك أصوات اللعبة — توليد كامل عبر Web Audio بدون أي ملفات صوتية
// جيل جديد: طبقات نغمات + ضجيج مُرشّح + مظاريف هجوم/انحلال طبيعية
// لمحاكاة صوت قطع خشبية حقيقية على الرقعة (نقلة/أكل/كش/تبييت/نتيجة)
// + تحكم بمستوى الصوت العام عبر مضخم رئيسي مع ضاغط (Compressor) يمنع التشبع

const LS_ENABLED = 'chess-sound'
const LS_VOLUME = 'chess-volume'

let enabled = true
let volume = 0.6
let ctx: AudioContext | null = null
let master: GainNode | null = null

export function setSoundEnabled(v: boolean) {
  enabled = v
  try { localStorage.setItem(LS_ENABLED, v ? '1' : '0') } catch { /* تجاهل */ }
}

export function isSoundEnabled(): boolean {
  try { return localStorage.getItem(LS_ENABLED) !== '0' } catch { return true }
}

export function setSoundVolume(v: number) {
  volume = Math.max(0, Math.min(1, v))
  try { localStorage.setItem(LS_VOLUME, String(volume)) } catch { /* تجاهل */ }
  if (master && ctx) {
    try { master.gain.setTargetAtTime(volume * 0.9, ctx.currentTime, 0.02) } catch { /* تجاهل */ }
  }
}

export function getSoundVolume(): number {
  try {
    const raw = localStorage.getItem(LS_VOLUME)
    const v = raw === null ? NaN : Number(raw)
    if (!Number.isNaN(v)) return Math.max(0, Math.min(1, v))
  } catch { /* تجاهل */ }
  return 0.6
}

function getCtx(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      ctx = new AC()
      // مضخم رئيسي + ضاغط: صوت متوازن حتى عند تراكب عدة طبقات
      master = ctx.createGain()
      master.gain.value = volume * 0.9
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -18
      comp.knee.value = 22
      comp.ratio.value = 8
      comp.attack.value = 0.003
      comp.release.value = 0.18
      master.connect(comp)
      comp.connect(ctx.destination)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

interface ToneOpts {
  freq: number
  end?: number // انزلاق تردد اختياري (هرتز)
  dur: number
  type?: OscillatorType
  gain?: number
  when?: number // إزاحة ثوانٍ من الآن
  attack?: number
}

function tone({ freq, end, dur, type = 'sine', gain = 0.3, when = 0, attack = 0.004 }: ToneOpts) {
  const c = ctx!
  const t0 = c.currentTime + when
  const osc = c.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(Math.max(30, freq), t0)
  if (end && end !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(30, end), t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(master!)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

interface NoiseOpts {
  dur: number
  gain?: number
  freq?: number // مركز مرشح bandpass
  q?: number
  type?: BiquadFilterType
  when?: number
  attack?: number
}

function noise({ dur, gain = 0.2, freq = 1200, q = 1, type = 'bandpass', when = 0, attack = 0.002 }: NoiseOpts) {
  const c = ctx!
  const t0 = c.currentTime + when
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  const src = c.createBufferSource()
  src.buffer = buf
  const filt = c.createBiquadFilter()
  filt.type = type
  filt.frequency.value = freq
  filt.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filt)
  filt.connect(g)
  g.connect(master!)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

// نقلة خشبية أساسية (تُعاد استخدامها بأوزان مختلفة)
function woodenTock(when = 0, pitch = 1, loud = 1) {
  tone({ freq: 245 * pitch, end: 165 * pitch, dur: 0.085, type: 'sine', gain: 0.5 * loud, when, attack: 0.002 })
  tone({ freq: 620 * pitch, end: 380 * pitch, dur: 0.045, type: 'triangle', gain: 0.12 * loud, when, attack: 0.001 })
  noise({ dur: 0.03, gain: 0.16 * loud, freq: 1900, q: 2.5, when, attack: 0.001 })
}

export const sfx = {
  move() {
    if (!enabled || !getCtx()) return
    try { woodenTock(0, 1, 1) } catch { /* تجاهل */ }
  },

  capture() {
    if (!enabled || !getCtx()) return
    try {
      // ارتطام أعمق + خشخشة القطعة المرتفعة
      tone({ freq: 175, end: 110, dur: 0.13, type: 'sine', gain: 0.62, attack: 0.002 })
      tone({ freq: 95, dur: 0.09, type: 'triangle', gain: 0.28, attack: 0.003 })
      noise({ dur: 0.07, gain: 0.32, freq: 950, q: 1.4 })
      noise({ dur: 0.045, gain: 0.2, freq: 1500, q: 3, when: 0.05 })
    } catch { /* تجاهل */ }
  },

  castle() {
    if (!enabled || !getCtx()) return
    try {
      woodenTock(0, 0.94, 0.9)
      woodenTock(0.075, 0.86, 1)
    } catch { /* تجاهل */ }
  },

  check() {
    if (!enabled || !getCtx()) return
    try {
      // نبضتان صاعدتان حاذقتان + لمعان معدني خافت
      tone({ freq: 640, end: 880, dur: 0.11, type: 'triangle', gain: 0.34 })
      tone({ freq: 990, dur: 0.13, type: 'triangle', gain: 0.3, when: 0.115 })
      tone({ freq: 1980, dur: 0.1, type: 'sine', gain: 0.07, when: 0.115 })
      noise({ dur: 0.05, gain: 0.08, freq: 4200, q: 1.2, when: 0.115, type: 'highpass' })
    } catch { /* تجاهل */ }
  },

  select() {
    if (!enabled || !getCtx()) return
    try {
      tone({ freq: 1180, dur: 0.035, type: 'sine', gain: 0.12, attack: 0.001 })
      noise({ dur: 0.02, gain: 0.05, freq: 3200, q: 2 })
    } catch { /* تجاهل */ }
  },

  win() {
    if (!enabled || !getCtx()) return
    try {
      // فانفار صاعد (دو C الخامس) بطبقتين + رشقة لمعان
      const seq = [523.25, 659.25, 783.99, 1046.5]
      seq.forEach((f, i) => {
        tone({ freq: f, dur: 0.17, type: 'triangle', gain: 0.26, when: i * 0.115 })
        tone({ freq: f / 2, dur: 0.17, type: 'sine', gain: 0.14, when: i * 0.115 })
      })
      ;[523.25, 659.25, 783.99].forEach((f) => tone({ freq: f, dur: 0.55, type: 'triangle', gain: 0.16, when: 0.5, attack: 0.01 }))
      tone({ freq: 1046.5, dur: 0.6, type: 'sine', gain: 0.18, when: 0.5, attack: 0.01 })
      noise({ dur: 0.4, gain: 0.06, freq: 5200, q: 0.8, when: 0.5, type: 'highpass' })
    } catch { /* تجاهل */ }
  },

  lose() {
    if (!enabled || !getCtx()) return
    try {
      // هبوط حزين عبر مُرشح منخفض
      const seq = [392, 311.13, 261.63]
      seq.forEach((f, i) => {
        tone({ freq: f, dur: 0.24, type: 'sawtooth', gain: 0.16, when: i * 0.19 })
        tone({ freq: f, dur: 0.24, type: 'sine', gain: 0.2, when: i * 0.19 })
      })
      tone({ freq: 130.8, dur: 0.5, type: 'sine', gain: 0.16, when: 0.55, attack: 0.01 })
    } catch { /* تجاهل */ }
  },

  draw() {
    if (!enabled || !getCtx()) return
    try {
      tone({ freq: 440, dur: 0.19, type: 'triangle', gain: 0.24 })
      tone({ freq: 495, dur: 0.26, type: 'triangle', gain: 0.24, when: 0.2 })
    } catch { /* تجاهل */ }
  },

  aiThinking() {
    if (!enabled || !getCtx()) return
    try {
      tone({ freq: 620, dur: 0.12, type: 'sine', gain: 0.07, attack: 0.01 })
    } catch { /* تجاهل */ }
  },

  chatMessage() {
    if (!enabled || !getCtx()) return
    try {
      tone({ freq: 540, end: 860, dur: 0.09, type: 'sine', gain: 0.28, attack: 0.003 })
      tone({ freq: 860, dur: 0.07, type: 'sine', gain: 0.1, when: 0.11 })
    } catch { /* تجاهل */ }
  },
}
